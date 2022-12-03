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

async function generateTokenAndListen() {
    let token_url = new URL('https://id.twitch.tv/oauth2/token');
    token_url.search = new URLSearchParams([
        [ 'client_id',      config.client_id ],
        [ 'client_secret',  config.client_secret ],
        [ 'grant_type',    'client_credentials' ]
    ]).toString();

    let token_resp = await fetch(
        token_url,
        {
            method: 'POST',
            headers: {
                'Accept': 'application/json'
            }
        }
    )

    if (token_resp.status == 200) {
        try {
            let token_body = await token_resp.json();

            config.api_token = token_body.access_token;
            console.log('Got a App Access Token', config.api_token);
            console.log('Ready to start');

            // now raise the server
            // as we are ready to process
            http.listen(config.port, function () {
                console.log('booted express on', config.port);
            });

            return;
        } catch (e) {
            console.error('Error at token generation parse', e);
            process.exit();
        }
    }

    console.error('Error at token generation', token_resp.status, await token_resp.text());
    process.exit();
}

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
    .post(async (req, res) => {
        //if (req.extension.hasOwnProperty('channel_id')) {
        if (req.extension.hasOwnProperty('user_id')) {
            console.log('Looking up', req.extension.user_id);
            // we collected the Extension Logged in userID
            // so lets call Get users
            let users_url = new URL('https://api.twitch.tv/helix/users');
            users_url.search = new URLSearchParams([
                [ 'id', req.extension.user_id ]
            ]).toString();

            let users_resp = await fetch(
                users_url,
                {
                    method: 'GET',
                    headers: {
                        'Client-ID': config.client_id,
                        'Authorization': 'Bearer ' + config.api_token,
                        'Accept': 'application/json'
                    }
                }
            )

            if (users_resp.status == 200) {
                console.log('TwitchAPI Rate:', users_resp.headers.get('ratelimit-remaining'), '/', users_resp.headers.get('ratelimit-limit'));
                try {
                    let users_data = await users_resp.json();

                    if (users_data.data && users_data.data.length == 1) {
                        // only return the single user
                        // no need to dump an array to the front end
                        res.json({error: false, data: users_data.data[0]});
                    } else {
                        res.status(404).json({error: true, message: 'User not found'});
                    }

                    return;
                } catch (e) {
                    // drop to fail
                }
            }

            res.status(500).json({error: true, message: 'Twitch API failed'});
        } else {
            res.status(401).json({error: true, message: 'Not Logged into Extension'});
        }
    });


generateTokenAndListen();
