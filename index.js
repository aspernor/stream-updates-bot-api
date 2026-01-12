const express = require('express')
const axios = require('axios');
require('dotenv').config()

var app = express();
app.use(express.json());
const port = 3000;


//CONSTS
const twitch_token = process.env.TWITCH_TOKEN;
const twitch_client_id = process.env.TWITCH_CLIENT_ID;
const discord_token = process.env.DISCORD_TOKEN;
const hookdeck_token = process.env.HOOKDECK_TOKEN;

const twitch_headers = {
    'Content-Type': 'application/json',
    'Authorization': twitch_token,
    'Client-ID': twitch_client_id
}

const discord_headers =  {
    'Content-Type': 'application/json',
    'Authorization': discord_token
}

const hookdeck_headers = {
    'Content-Type': 'application/json',
    'Authorization': hookdeck_token
}


//Twitch API Calls
async function get_user_id(streamer_name, dm_channel_id, action) {
    const url = `https://api.twitch.tv/helix/users?login=${streamer_name}`;

    await axios.get(url,
    {
        headers: twitch_headers
    })
    .then(response => {
        if(response.data.data[0]) {
            if (action == "subscribe") {
                create_subscription(response.data.data[0]['id']);
            }
            check_for_existing_connections(streamer_name, dm_channel_id, action);
        }
        else {
            user_cannot_be_found(dm_channel_id);
        }
    })
    .catch(err => {
        // Handle errors
        console.error(err);
        user_cannot_be_found(dm_channel_id);
    });
}

async function create_subscription(streamer_id) {
    const url = `https://api.twitch.tv/helix/eventsub/subscriptions`;
	const data = {
        "type": "channel.update",
        "version": "2",
        "condition": {
          "broadcaster_user_id": streamer_id
        },
        "transport": {
          "method": "webhook",
          "callback": "https://stream-updates-bot-api.onrender.com/notifications",
          "secret": "temppassword"
        }
      };
    const response = await axios.post(url, data,
    {
    headers: twitch_headers
    }).then(response => {
        //console.log(response)
    })
    .catch(err => {
        // Handle errors
        //console.error(err);;
    });
}



//Discord API Calls
async function user_already_subscribed(streamer_name, dm_channel_id) {
    const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;
    const data = {
        "embeds": [
            {
                "title": "Error",
                "description": `You are already subscribed to ${streamer_name}!`
            }
        ]
    };
    const response = await axios.post(url, data,
    {
    headers: discord_headers
    });
}

async function user_not_subscribed(streamer_name, dm_channel_id) {
    const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;
    const data = {
        "embeds": [
            {
                "title": "Error",
                "description": `You are not subscribed to ${streamer_name}!`
            }
        ]
    };
    const response = await axios.post(url, data,
    {
    headers: discord_headers
    });
}

async function user_cannot_be_found(dm_channel_id) {
    const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;
    const data = {
        "embeds": [
            {
                "title": "Error",
                "description": `User cannot be found!`
            }
        ]
    };
    const response = await axios.post(url, data,
    {
    headers: discord_headers
    });
}

async function send_subscription_confirmation(streamer_name, dm_channel_id) {
    const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;
    const data = {
        "embeds": [
            {
                "title": "Success",
                "description": `Subscription to ${streamer_name} added!`
            }
        ]
    };
    const response = await axios.post(url, data,
    {
    headers: discord_headers
    });
}

async function send_unsubscription_confirmation(streamer_name, dm_channel_id) {
    const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;
    const data = {
        "embeds": [
            {
                "title": "Success",
                "description": `Subscription to ${streamer_name} removed!`
            }
        ]
    };
    const response = await axios.post(url, data,
    {
    headers: discord_headers
    });
}



//Hookdeck API Calls
async function create_ruleset(streamer_name, dm_channel_id) {
    const url = `https://api.hookdeck.com/2025-07-01/rulesets`;
	const data = {
        "name": streamer_name,
        "rules": [
                      {
                          "type": "transform",
                          "transformation_id": "trs_uG3UE3yq8wHZWT"
                      },
                      {
                          "type": "filter",
                          "headers": {
                              "twitch-channel": {
                                  "$eq": streamer_name
                              }
                          }
                      }
                  ]
      };
    const response = await axios.post(url, data,
    {
    headers: hookdeck_headers
    });

    create_connection(streamer_name, dm_channel_id);
}

async function create_connection(streamer_name, dm_channel_id) {
    const url = `https://api.hookdeck.com/2025-07-01/connections`;
	const data = {
        "name": `${dm_channel_id}-${streamer_name}`,
        "source": {
          "name": "twitch-api"
        },
        "destination": {
          "name": `${dm_channel_id}-${streamer_name}`,
          "config": {
                "url": `https://discord.com/api/channels/${dm_channel_id}/messages`
            }
        },
        "rules": [
                      {
                          "type": "transform",
                          "transformation_id": "trs_uG3UE3yq8wHZWT"
                      },
                      {
                          "type": "filter",
                          "headers": {
                              "twitch-channel": {
                                  "$eq": streamer_name
                              }
                          }
                      }
                  ]
      };
    const response = await axios.post(url, data,
    {
    headers: hookdeck_headers
    });

    send_subscription_confirmation(streamer_name, dm_channel_id);
}

async function delete_connection(streamer_name, dm_channel_id, connection_id) {
    const url = `https://api.hookdeck.com/2025-07-01/connections/${connection_id}`;
    const response = await axios.delete(url,
    {
    headers: hookdeck_headers
    });

    send_unsubscription_confirmation(streamer_name, dm_channel_id);
}

async function check_for_existing_connections(streamer_name, dm_channel_id, action) {
    const url = `https://api.hookdeck.com/2025-07-01/connections?name=${dm_channel_id}-${streamer_name}`;

    await axios.get(url,
    {
        headers: hookdeck_headers
    })
    .then(response => {
        if(response.data['count'] != 0) {
            if (action == "subscribe") {
                user_already_subscribed(streamer_name, dm_channel_id);
            }
            else if (action == "unsubscribe") {
                delete_connection(streamer_name, dm_channel_id, response.data['models'][0]['id'])
            }
        }
        else {
            if (action == "subscribe") {
                create_connection(streamer_name, dm_channel_id);
            }
            else if (action == "unsubscribe") {
                user_not_subscribed(streamer_name, dm_channel_id);
            }
        }
    })
    .catch(err => {
        // Handle errors
        console.error(err);
    });
}

app.post('/notifications', async function (req, res) {
    console.log("Headers:"+ JSON.stringify(req.headers, null, 3));
    console.log("Body:"+ JSON.stringify(req.body, null, 3));
 
    if(req.body.challenge!=null){
       console.log("Query challenge: "+ req.query.challenge);

       res.type('txt');
       res.send(req.body.challenge);
    }else{

    const url = `https://events.hookdeck.com/e/src_qgjptZghkiAQ`;
	const data = {
             "embeds": [
                {
                   "title": "New Stream Update",
                   "url": "https://twitch.com/" + req.body.event.broadcaster_user_name,
                   "description": "`Channel` : *" + req.body.event.broadcaster_user_name
                                  + "*\n\n`Title` : *" + req.body.event.title
                                  + "*\n\n`Category` : *" + req.body.event.category_name
                                  + "*"
                }
             ]
         };
    const response = await axios.post(url, data,
    {
    headers:    {
        'Content-Type': 'application/json',
        'Twitch-Channel': req.body.event.broadcaster_user_login,
        'Authorization': discord_token
    }
    }).then(response => {
        res.sendStatus(200);
    })
    .catch(err => {
        res.sendStatus(200);
    });

    }
 })

app.use(express.json());

app.post('/subscribe', (req, res) => {
    res.send();
    get_user_id(req.body['channel'], req.body['dm_channel_id'], "subscribe")
});

app.post('/unsubscribe', (req, res) => {
    res.send();
    get_user_id(req.body['channel'], req.body['dm_channel_id'], "unsubscribe")
});

app.get('/', (req, res) => {
   res.send('Hello World!')
 })

 app.listen(port, function () {
    console.log(`App listening at ${port}`)
 })