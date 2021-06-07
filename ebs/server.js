const fs = require('fs');
const path = require('path');

/* Load Configuration, ports and secrets */
const config = JSON.parse(
    fs.readFileSync(
        path.join(
            __dirname,
            'config.json'
        )
    )
);

/* Load Common Libs */
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const got = require('got');

const app = express();
const http = require('http').Server(app);

/*
Twitch will provide the extension secret, base64 encoded
So we must base64 decode it before we can use it.
*/
config.secret = Buffer.from(config.extension_secret, 'base64');

/*
Lets generate an App Access Token

For example/test purposes
This generates one token, which will be valid for around 60 days
And won't refresh/remake it
But this test server is a test example
So a refresh/remake shouldn't be needed
*/
got({
    url: 'https://id.twitch.tv/oauth2/token',
    method: 'POST',
    form: {
        client_id: config.client_id,
        client_secret: config.client_secret,
        grant_type: 'client_credentials'
    },
    responseType: 'json'
})
.then(resp => {
    if (resp.body.hasOwnProperty('access_token')) {
        config.api_token = resp.body.access_token;
        console.log('Got a App Access Token', config.api_token);
        console.log('Ready to start');

        // now raise the server
        // as we are ready to process
        http.listen(config.port, function () {
            console.log('booted express on', config.port);
        });
    } else {
        // some thing REALLY went wrong
        console.error('No access_token', resp.body);
        process.exit();
    }
})
.catch(err => {
    if (err.response) {
        console.error('Error at token generation', err.response.statusCode, err.response.body);
    } else {
        console.error('Error at token generation', err);
    }
    process.exit();
});

/*
a dumb route logger
this will log whenever a HTTP request comes in
for simple debug purposes
*/
app.use((req,res,next) => {
    console.log(req.originalUrl);
    next();
});

/*
Bind CORS for fetch calls to work
In production you generally wouldn't do this in a global way
But make it route specific
*/
app.use('/', cors());

/*
Bind a JWT parsing function
Similar to cors probably want to make this route specific
rather than global

But if this server only does extension traffic then all good to global
*/
app
    .use('/:route?', (req, res, next) => {
        if (req.headers['authorization']) {
            let [ type, auth ] = req.headers['authorization'].split(' ');

            if (type == 'Bearer') {
                jwt.verify(
                    auth,
                    config.secret,
                    (err, decoded) => {
                        if (err) {
                            console.log('JWT Error', err);

                            res.status('401').json({error: true, message: 'Invalid authorization'});
                            return;
                        }

                        req.extension = decoded;

                        console.log('Extension Data:', req.extension);

                        next();
                    }
                );

                return;
            }

            res.status('401').json({error: true, message: 'Invalid authorization header'});
        } else {
            res.status('401').json({error: true, message: 'Missing authorization header'});
        }
    })

/*
And lets actaully setup the API calls/endpoints
*/
app.route('/')
    .get((req, res) => {
        res.status('404').json({error: true, message: 'GET Not supported'});
    })
    .post((req, res) => {
        //if (req.extension.hasOwnProperty('channel_id')) {
        if (req.extension.hasOwnProperty('user_id')) {
            console.log('Looking up', req.extension.user_id);
            // we collected the Extension Logged in userID
            // so lets call Get users
            got({
                url: 'https://api.twitch.tv/helix/users',
                method: 'GET',
                headers: {
                    'client-id': config.client_id,
                    'authorization': 'Bearer ' + config.api_token
                },
                searchParams: {
                    id: req.extension.user_id
                },
                responseType: 'json'
            })
            .then(resp => {
                // monitor our rate limit
                console.log('TwitchAPI Rate:', resp.headers['ratelimit-remaining'], '/', resp.headers['ratelimit-limit']);
                if (resp.body.data && resp.body.data.length == 1) {
                    // only return the single user
                    // no need to dump an array to the front end
                    res.json({error: false, data: resp.body.data[0]});
                } else {
                    res.status('404').json({error: true, message: 'User not found'});
                }
            })
            .catch(err => {
                if (err.response.statusCode) {
                    console.error('Twitch API streams Failed', err.response.statusCode, err.response.body);
                } else {
                    console.error('Error', err);
                }
                res.status('500').json({error: true, message: 'Twitch API failed'});
            })
        } else {
            res.status('401').json({error: true, message: 'Not Logged into Extension'});
        }
    });
