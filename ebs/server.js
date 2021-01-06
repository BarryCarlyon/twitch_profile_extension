const fs = require('fs');
const path = require('path');

/* usual suspects */
const config = JSON.parse(
    fs.readFileSync(
        path.join(
            __dirname,
            'config.json'
        )
    )
);

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const got = require('got');

const app = express();
const http = require('http').Server(app);

config.secret = Buffer.from(config.extension_secret, 'base64');

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
        console.error('No access_token', resp.body);
        process.exit();
    }
})
.catch(err => {
    console.error('Error at token generation', err.statusCode, err.body);
    process.exit();
});

// a dumb route logger
app.use((req,res,next) => {
    console.log(req.originalUrl);
    next();
});

// Bind CORS for fetch calls to work
app.use('/', cors());

// Bind a JWT parsing function
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

// and bund the actual event processing
app.route('/')
    .get((req, res) => {
        res.status('404').json({error: true, message: 'GET Not supported'});
    })
    .post((req, res) => {
        //if (req.extension.hasOwnProperty('channel_id')) {
        if (req.extension.hasOwnProperty('user_id')) {
            console.log('Looking up', req.extension.user_id);
            got({
                url: 'https://api.twitch.tv/helix/users?id=' + req.extension.user_id,
                method: 'GET',
                headers: {
                    'client-id': config.client_id,
                    'authorization': 'Bearer ' + config.api_token
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

app.post('/webhooks/', (req, res) => {
    res.send('Ok');
});
