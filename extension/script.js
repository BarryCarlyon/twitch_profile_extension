window.Twitch.ext.onAuthorized((auth) => {
    if (window.Twitch.ext.viewer.isLinked) {
        // user is logged in/ID Shared
        document.body.classList.add('logged_in');
        document.body.classList.remove('logged_out');

        loadProfile();
    } else {
        document.body.classList.remove('logged_in');
        document.body.classList.add('logged_out');
    }
});

var last_theme = ''
window.Twitch.ext.onContext((ctx) => {
    var new_theme = ctx.theme;

    if (last_theme != new_theme) {
        document.body.classList.remove('twitch_light');
        document.body.classList.remove('twitch_dark');
        document.body.classList.add('twitch_' + new_theme);
    }

    new_theme = last_theme;
});

document.getElementById('share').addEventListener('click', (e) => {
    e.preventDefault();

    window.Twitch.ext.actions.requestIdShare();
});

function loadProfile() {
    document.getElementById('error').textContent = 'Loading';

    fetch(
        my_ebs,
        {
            method: 'POST',
            headers: {
                authorization: 'Bearer ' + window.Twitch.ext.viewer.sessionToken
            }
        }
    )
    .then(resp => {
        return resp.json();
    })
    .then(resp => {
        if (resp.error) {
            document.getElementById('error').textContent = 'Got Error' + resp.message;
            return;
        }

        document.getElementById('error').textContent = 'Got profile';

        document.getElementById('logged_in').textContent = '';

        var tbl = document.createElement('table');
        document.getElementById('logged_in').append(tbl);
        for (var key in resp.data) {
            var r = document.createElement('tr');
            tbl.append(r);
            var d = document.createElement('th');
            r.append(d);
            d.textContent = key;

            var d = document.createElement('td');
            r.append(d);
            switch (key) {
                case 'profile_image_url':
                case 'offline_image_url':
                    var i = document.createElement('img');
                    i.setAttribute('src', resp.data[key]);
                    d.append(i);
                    break;
                default:
                    d.textContent = resp.data[key];
            }
        }
    })
    .catch(err => {
        if (err.message) {
            document.getElementById('error').textContent = err.message;
        } else {
            document.getElementById('error').textContent = 'An Error Occured';
        }
    });
}
