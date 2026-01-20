const express = require("express");
const axios = require("axios");
const nacl = require("tweetnacl");
const ngrok = require("@ngrok/ngrok");
require("dotenv").config();

var app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
const port = process.env.PORT || 3000;

//CONSTS
const twitch_token = process.env.TWITCH_TOKEN;
const kick_token = process.env.KICK_TOKEN;
const twitch_client_id = process.env.TWITCH_CLIENT_ID;
const twitch_eventsub_secret = process.env.TWITCH_EVENTSUB_SECRET;
const discord_token = process.env.DISCORD_TOKEN;
const hookdeck_token = process.env.HOOKDECK_TOKEN;
const discord_public_key = process.env.DISCORD_PUBLIC_KEY;
const ngrok_token = process.env.NGROK_TOKEN;
const discord_stream_updates_channel =
  process.env.DISCORD_STREAM_UPDATES_CHANNEL_ID;
const discord_webhook_id = process.env.DISCORD_WEBHOOK_ID;
const discord_webhook_token = process.env.DISCORD_WEBHOOK_TOKEN;
const discord_application_id = process.env.DISCORD_APPLICATION_ID;
const twitch_hookdeck_transformation =
  process.env.TWITCH_HOOKDECK_TRANSFORMATION;
const kick_hookdeck_transformation = process.env.KICK_HOOKDECK_TRANSFORMATION;
const discord_bot_log_url = process.env.DISCORD_BOT_LOGO_URL;
const twitch_logo_url = process.env.TWITCH_LOGO_URL;
const kick_logo_url = process.env.KICK_LOGO_URL;

const twitch_headers = {
  "Content-Type": "application/json",
  Authorization: twitch_token,
  "Client-ID": twitch_client_id,
};
const kick_headers = {
  "Content-Type": "application/json",
  Authorization: kick_token,
};

const discord_headers = {
  "Content-Type": "application/json",
  Authorization: discord_token,
};

const hookdeck_headers = {
  "Content-Type": "application/json",
  Authorization: hookdeck_token,
};

const bot_footer = {
  text: "Stream Updates Bot",
  icon_url: discord_bot_log_url,
};

//ngrok setup, set DEVELOPMENT env variable to true. Don't forget to change interaction endpoint in discord and kick application portal

if (process.env.NODE_ENV === "dev") {
  (async () => {
    const listener = await ngrok.forward({
      addr: port,
      authtoken: ngrok_token,
    });
    console.log(`Ingress established at: ${listener.url()}`);
  })();
}

//Twitch API Calls
async function get_twitch_user_id(subscriptionData, res) {
  const { streamer_name } = subscriptionData;
  const url = `https://api.twitch.tv/helix/users?login=${streamer_name}`;

  await axios
    .get(url, {
      headers: twitch_headers,
    })
    .then((response) => {
      if (response.data.data[0]) {
        ((subscriptionData.broadcaster_user_id = response.data.data[0]["id"]),
          (subscriptionData.profile_pic_url =
            response.data.data[0]["profile_image_url"]),
          (subscriptionData.streamer_name =
            response.data.data[0]["display_name"]));
        add_profile_pic_to_transformations_env(subscriptionData, res);
      } else {
        user_cannot_be_found(subscriptionData, res);
      }
    })
    .catch((err) => {
      console.log(err);
      user_cannot_be_found(subscriptionData, res);
    });
}

async function get_kick_user_id(subscriptionData, res) {
  const { streamer_name } = subscriptionData;
  const url = `https://api.kick.com/public/v1/channels?slug=${streamer_name}`;

  const response = await axios
    .get(url, {
      headers: kick_headers,
    })
    .then((response) => {
      subscriptionData.broadcaster_user_id =
        response.data.data[0].broadcaster_user_id;
      get_kick_profile_pic_url(subscriptionData, res);
    })
    .catch((err) => {
      console.log(err);
      user_cannot_be_found(subscriptionData, res);
    });

  return response;
}

async function get_kick_profile_pic_url(subscriptionData, res) {
  const { broadcaster_user_id } = subscriptionData;
  const url = `https://api.kick.com/public/v1/users?id=${broadcaster_user_id}`;

  const response = await axios
    .get(url, {
      headers: kick_headers,
    })
    .then((response) => {
      ((subscriptionData.profile_pic_url =
        response.data.data[0].profile_picture),
        (subscriptionData.streamer_name = response.data.data[0].name));
      check_for_existing_kick_connections(subscriptionData, res);
    })
    .catch((err) => {
      console.log(err);
    });

  return response;
}

async function create_subscription(source_url, subscriptionData) {
  const { broadcaster_user_id } = subscriptionData;
  const url = `https://api.twitch.tv/helix/eventsub/subscriptions`;
  const data = {
    type: "channel.update",
    version: "2",
    condition: {
      broadcaster_user_id: broadcaster_user_id,
    },
    transport: {
      method: "webhook",
      callback: source_url,
      secret: twitch_eventsub_secret,
    },
  };

  axios
    .post(url, data, {
      headers: twitch_headers,
    })
    .then((response) => {
      console.log(response);
    })
    .catch((err) => {
      console.error(err);
    });
}

async function create_kick_subscription(subscriptionData) {
  const { broadcaster_user_id } = subscriptionData;
  const url = `https://api.kick.com/public/v1/events/subscriptions`;
  const data = {
    broadcaster_user_id: broadcaster_user_id,
    method: "webhook",
    events: [
      {
        name: "livestream.metadata.updated",
        version: 1,
      },
    ],
  };

  axios
    .post(url, data, {
      headers: kick_headers,
    })
    .then((response) => {
      console.log(response);
    })
    .catch((err) => {
      console.error(err);
    });
}

//Discord API Calls
async function get_discord_dm_channel_id(thread_id, discord_user_id) {
  const url = `https://discord.com/api/users/@me/channels`;

  const data = { recipient_id: discord_user_id };

  axios
    .post(url, data, {
      headers: discord_headers,
    })
    .then((response) => {
      send_instruction_message(thread_id, response.data.id);
    })
    .catch((err) => {
      console.error(err);
    });
}

async function create_thread(discord_user_id) {
  const url = `https://discord.com/api/channels/${discord_stream_updates_channel}/threads`;

  const data = {
    name: "notifications",
    type: 12,
    invitable: false,
    auto_archive_duration: 60,
  };

  axios
    .post(url, data, {
      headers: discord_headers,
    })
    .then((response) => {
      create_destination(discord_user_id, response.data.id);
      add_user_to_private_thread(response.data.id, discord_user_id);
    })
    .catch((err) => {
      console.error(err);
    });
}

//Twitch API Calls
async function get_thread(thread_id) {
  const url = `https://discord.com/api/channels/${thread_id}`;

  const response = await axios
    .get(url, {
      headers: discord_headers,
    })
    .then((response) => {
      return true;
    })
    .catch((err) => {
      console.log(err);
      return false;
    });

  return response;
}

async function get_private_thread_id(discord_user_id) {
  //Find hookdeck destination with user id as name, then get the description to find thread_id

  const response = await get_destination_description(discord_user_id);

  //Double check if thread still exists

  if (response.data.count == 0) {
    create_thread(discord_user_id);
  } else {
    const thread_id = response.data.models[0].description;
    const thread_still_exists = await get_thread(thread_id);
    if (thread_still_exists) {
      add_user_to_private_thread(thread_id, discord_user_id);
    } else {
      create_thread(discord_user_id);
    }
  }
}

async function add_user_to_private_thread(thread_id, discord_user_id) {
  const url = `https://discord.com/api/channels/${thread_id}/thread-members/${discord_user_id}`;
  const data = {};
  axios
    .put(url, data, {
      headers: discord_headers,
    })
    .then((response) => {
      get_discord_dm_channel_id(thread_id, discord_user_id);
    })
    .catch((err) => {
      console.log(err);
    });
}

async function send_instruction_message(thread_id, dm_channel_id) {
  const url = `https://discord.com/api/channels/${dm_channel_id}/messages`;

  const instructionMessage = {
    embeds: [
      {
        title: "**Welcome!**",
        fields: [
          {
            name: "Subscribe To Updates",
            value: "> </subscribe:1460766853688332361>  `platform`  `streamer`",
          },
          {
            name: "Unsubscribe From Updates",
            value:
              "> </unsubscribe:1460768302581289063>  `platform`  `streamer`",
          },
          {
            name: "View Active Subscriptions",
            value: "> </subscriptions:1460521521402609771>",
          },
          {
            name: "Your Notifications Thread",
            value: `>>> <#${thread_id}>\n1. Open the thread\n2. Tap the thread name\n3. Go to **Notification Settings** (🔔)\n4. Enable for **All Messages**`,
          },
          {
            name: "Donate",
            value: "<#1460978877533786205>",
          },
        ],
        footer: bot_footer,
      },
    ],
  };

  const data = instructionMessage;
  axios.post(url, data, {
    headers: discord_headers,
  });
}

async function user_already_subscribed(subscriptionData, res) {
  const { streamer_name, platform, interaction } = subscriptionData;

  let platform_name = "";
  let platform_logo_url = "";
  if (platform == "twitch") {
    platform_name = "Twitch";
    platform_logo_url = twitch_logo_url;
  } else if (platform == "kick") {
    platform_name = "Kick";
    platform_logo_url = kick_logo_url;
  }

  const userAlreadySubscribedMessage = (streamer_name) => ({
    embeds: [
      {
        title: "Error",
        description: `> You are already subscribed to **${streamer_name}**!`,
        author: { name: platform_name, icon_url: platform_logo_url },
        footer: bot_footer,
      },
    ],
  });

  const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

  axios.post(callback_url, userAlreadySubscribedMessage(streamer_name), {
    headers: discord_headers,
  });
}

async function user_not_subscribed(subscriptionData, res) {
  const { streamer_name, platform, interaction } = subscriptionData;

  let platform_name = "";
  let platform_logo_url = "";
  if (platform == "twitch") {
    platform_name = "Twitch";
    platform_logo_url = twitch_logo_url;
  } else if (platform == "kick") {
    platform_name = "Kick";
    platform_logo_url = kick_logo_url;
  }

  const userNotSubscribedMessage = (streamer_name) => ({
    embeds: [
      {
        title: "Error",
        description: `> You are not subscribed to **${streamer_name}**!`,
        author: { name: platform_name, icon_url: platform_logo_url },
        footer: bot_footer,
      },
    ],
  });

  const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

  axios.post(callback_url, userNotSubscribedMessage(streamer_name), {
    headers: discord_headers,
  });
}

async function user_cannot_be_found(subscriptionData, res) {
  const { platform, interaction } = subscriptionData;
  let platform_name = "";
  let platform_logo_url = "";
  if (platform == "twitch") {
    platform_name = "Twitch";
    platform_logo_url = twitch_logo_url;
  } else if (platform == "kick") {
    platform_name = "Kick";
    platform_logo_url = kick_logo_url;
  }

  const userNotFoundMessage = {
    embeds: [
      {
        title: "Error",
        description: `> User cannot be found!`,
        author: { name: platform_name, icon_url: platform_logo_url },
        footer: bot_footer,
      },
    ],
  };

  const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

  axios.post(callback_url, userNotFoundMessage, {
    headers: discord_headers,
  });
}

async function send_subscription_confirmation_interactions(
  subscriptionData,
  res,
) {
  const { streamer_name, profile_pic_url, platform, interaction } =
    subscriptionData;
  let platform_name = "";
  let platform_logo_url = "";
  if (platform == "twitch") {
    platform_name = "Twitch";
    platform_logo_url = twitch_logo_url;
  } else if (platform == "kick") {
    platform_name = "Kick";
    platform_logo_url = kick_logo_url;
  }

  const subscriptionMessage = {
    embeds: [
      {
        title: "Success",
        description: `> Subscription to **${streamer_name}** added!`,
        author: { name: platform_name, icon_url: platform_logo_url },
        thumbnail: {
          url: profile_pic_url,
        },
        footer: bot_footer,
      },
    ],
  };

  const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

  axios.post(callback_url, subscriptionMessage, {
    headers: discord_headers,
  });
}

async function send_unsubscription_confirmation_interactions(
  subscriptionData,
  res,
) {
  const { streamer_name, profile_pic_url, platform, interaction } =
    subscriptionData;
  let platform_name = "";
  let platform_logo_url = "";
  if (platform == "twitch") {
    platform_name = "Twitch";
    platform_logo_url = twitch_logo_url;
  } else if (platform == "kick") {
    platform_name = "Kick";
    platform_logo_url = kick_logo_url;
  }

  const unsubscriptionMessage = {
    embeds: [
      {
        title: "Success",
        description: `> Subscription to **${streamer_name}** removed!`,
        author: { name: platform_name, icon_url: platform_logo_url },
        thumbnail: {
          url: profile_pic_url,
        },
        footer: bot_footer,
      },
    ],
  };

  const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

  axios.post(callback_url, unsubscriptionMessage, {
    headers: discord_headers,
  });
}

//Hookdeck API Calls

async function add_profile_pic_to_transformations_env(subscriptionData, res) {
  const { broadcaster_user_id, profile_pic_url } = subscriptionData;

  const url = `https://api.hookdeck.com/2025-07-01/transformations/${twitch_hookdeck_transformation}`;
  axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      const data = {
        env: { ...response.data.env, [broadcaster_user_id]: profile_pic_url },
      };

      axios
        .put(url, data, {
          headers: hookdeck_headers,
        })
        .then((response) => {
          check_for_existing_connections(subscriptionData, res);
        })
        .catch((err) => {
          console.error(err);
        });
    })
    .catch((err) => {
      console.error(err);
    });
}

async function get_destination_id(subscriptionData, res) {
  const { discord_user_id } = subscriptionData;

  const url = `https://api.hookdeck.com/2025-07-01/destinations?name=${discord_user_id}`;
  axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      if (response.data.count == 0) {
        res.send([]);
      } else {
        send_subscriptions_interactions(
          response.data.models[0].id,
          subscriptionData,
          res,
        );
      }
    })
    .catch((err) => {
      console.log(err);
    });
}

async function get_destination_description(discord_user_id) {
  const url = `https://api.hookdeck.com/2025-07-01/destinations?name=${discord_user_id}`;
  const response = await axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.log(err);
    });

  return response;
}

async function send_subscriptions_interactions(
  destination_id,
  subscriptionData,
  res,
) {
  const { interaction } = subscriptionData;
  const url = `https://api.hookdeck.com/2025-07-01/connections?destination_id=${destination_id}`;
  axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      const subscriptions = [];
      for (let step = 0; step < response.data.count; step++) {
        subscriptions.push(response.data.models[step].source.description);
      }

      let description = ">>> ";

      for (const sub of subscriptions) {
        description += `${sub} \n`;
      }

      if (subscriptions.length == 0) {
        description = "> You are not subscribed to anybody.";
      }

      const subscriptionsMessage = {
        embeds: [
          {
            title: "Subscriptions",
            description: description,
            footer: bot_footer,
          },
        ],
      };

      const callback_url = `https://discord.com/api/webhooks/${discord_application_id}/${interaction.token}`;

      axios.post(callback_url, subscriptionsMessage, {
        headers: discord_headers,
      });
    })
    .catch((err) => {
      console.log(err);
    });
}

async function create_source(subscriptionData, res) {
  const { streamer_name, broadcaster_user_id } = subscriptionData;
  const url = `https://api.hookdeck.com/2025-07-01/sources`;
  const data = {
    name: `${broadcaster_user_id}`,
    description: `Twitch: ${streamer_name}`,
  };
  const response = await axios
    .put(url, data, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      create_connection(response.data.url, subscriptionData, res);
    })
    .catch((err) => {
      console.log(err);
    });
}

async function create_kick_source(subscriptionData, res) {
  const { streamer_name, broadcaster_user_id } = subscriptionData;
  const url = `https://api.hookdeck.com/2025-07-01/sources`;
  const data = {
    name: `${broadcaster_user_id}`,
    description: `Kick: ${streamer_name}`,
  };
  const response = await axios
    .put(url, data, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      create_kick_connection(response.data.url, subscriptionData, res);
    })
    .catch((err) => {
      console.log(err);
    });

  return response;
}

async function get_kick_source_url(broadcaster_user_id, streamer_name) {
  const url = `https://api.hookdeck.com/2025-07-01/sources`;
  const data = {
    name: `${broadcaster_user_id}`,
    description: `Kick: ${streamer_name}`,
  };
  const response = await axios
    .put(url, data, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      return response.data.url;
    })
    .catch((err) => {
      console.log(err);
    });

  return response;
}

async function create_destination(discord_user_id, thread_id) {
  const url = `https://api.hookdeck.com/2025-07-01/destinations`;
  const data = {
    name: discord_user_id,
    description: thread_id,
    config: {
      url: `https://discord.com/api/webhooks/${discord_webhook_id}/${discord_webhook_token}?thread_id=${thread_id}`,
    },
  };
  axios
    .put(url, data, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      console.log(response);
    })
    .catch((err) => {
      console.log(err);
    });
}

async function create_connection(source_url, subscriptionData, res) {
  const { broadcaster_user_id, discord_user_id } = subscriptionData;
  const description_response =
    await get_destination_description(discord_user_id);
  const thread_id = description_response.data.models[0].description;
  const url = `https://api.hookdeck.com/2025-07-01/connections`;
  const data = {
    name: `${broadcaster_user_id}-${discord_user_id}`,
    source: {
      name: `${broadcaster_user_id}`,
    },
    destination: {
      name: `${discord_user_id}`,
      description: thread_id,
      config: {
        url: `https://discord.com/api/webhooks/${discord_webhook_id}/${discord_webhook_token}?thread_id=${thread_id}`,
      },
    },
    rules: [
      {
        type: "transform",
        transformation_id: twitch_hookdeck_transformation,
      },
      {
        type: "filter",
        headers: {
          "twitch-channel": {
            $eq: broadcaster_user_id,
          },
        },
      },
    ],
  };

  axios.post(url, data, {
    headers: hookdeck_headers,
  });

  create_subscription(source_url, subscriptionData);

  send_subscription_confirmation_interactions(subscriptionData, res);
}

async function create_kick_connection(source_url, subscriptionData, res) {
  const { broadcaster_user_id, discord_user_id } = subscriptionData;
  const description_response =
    await get_destination_description(discord_user_id);
  const thread_id = description_response.data.models[0].description;
  const url = `https://api.hookdeck.com/2025-07-01/connections`;
  const data = {
    name: `${broadcaster_user_id}-${discord_user_id}`,
    source: {
      name: `${broadcaster_user_id}`,
    },
    destination: {
      name: `${discord_user_id}`,
      description: thread_id,
      config: {
        url: `https://discord.com/api/webhooks/${discord_webhook_id}/${discord_webhook_token}?thread_id=${thread_id}`,
      },
    },
    rules: [
      {
        type: "transform",
        transformation_id: kick_hookdeck_transformation,
      },
      {
        type: "filter",
        headers: {
          "kick-channel": {
            $eq: broadcaster_user_id,
          },
        },
      },
    ],
  };

  axios.post(url, data, {
    headers: hookdeck_headers,
  });

  create_kick_subscription(subscriptionData);

  send_subscription_confirmation_interactions(subscriptionData, res);
}

async function delete_connection(connection_id, subscriptionData, res) {
  const url = `https://api.hookdeck.com/2025-07-01/connections/${connection_id}`;

  axios.delete(url, {
    headers: hookdeck_headers,
  });

  send_unsubscription_confirmation_interactions(subscriptionData, res);
}

async function check_for_existing_connections(subscriptionData, res) {
  const { broadcaster_user_id, action, discord_user_id } = subscriptionData;
  const url = `https://api.hookdeck.com/2025-07-01/connections?name=${broadcaster_user_id}-${discord_user_id}`;

  await axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      if (response.data["count"] != 0) {
        if (action == "subscribe") {
          user_already_subscribed(subscriptionData, res);
        } else if (action == "unsubscribe") {
          delete_connection(
            response.data["models"][0]["id"],
            subscriptionData,
            res,
          );
        }
      } else {
        if (action == "subscribe") {
          create_source(subscriptionData, res);
        } else if (action == "unsubscribe") {
          user_not_subscribed(subscriptionData, res);
        }
      }
    })
    .catch((err) => {
      console.error(err);
    });
}

async function check_for_existing_kick_connections(subscriptionData, res) {
  const { broadcaster_user_id, action, discord_user_id } = subscriptionData;
  const url = `https://api.hookdeck.com/2025-07-01/connections?name=${broadcaster_user_id}-${discord_user_id}`;

  await axios
    .get(url, {
      headers: hookdeck_headers,
    })
    .then((response) => {
      if (response.data["count"] != 0) {
        if (action == "subscribe") {
          user_already_subscribed(subscriptionData, res);
        } else if (action == "unsubscribe") {
          delete_connection(
            response.data["models"][0]["id"],
            subscriptionData,
            res,
          );
        }
      } else {
        if (action == "subscribe") {
          create_kick_source(subscriptionData, res);
        } else if (action == "unsubscribe") {
          user_not_subscribed(subscriptionData, res);
        }
      }
    })
    .catch((err) => {
      console.error(err);
    });
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/", (req, res) => {
  console.log(req.body);
});

app.post("/kick", async (req, res) => {
  const url = await get_kick_source_url(
    req.body.broadcaster.user_id,
    req.body.broadcaster.channel_slug,
  );

  axios.post(url, req.body, {
    headers: {
      "kick-event-timestamp": req.headers["kick-event-message-timestamp"],
    },
  });

  res.sendStatus(200);
});

//to test interactions url
app.post("/interactions", async (req, res) => {
  //console.log(req);

  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  const body = req.rawBody; // rawBody is expected to be a string, not raw bytes

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + body),
    Buffer.from(signature, "hex"),
    Buffer.from(discord_public_key, "hex"),
  );

  if (!isVerified) {
    return res.status(401).end("invalid request signature");
  }

  const interaction = req.body;

  // Ping (type 1) -> Pong reply
  if (interaction.type === 1) {
    return res.json({ type: 1 }); // Pong
  }

  if (interaction.type === 2) {
    if (interaction.data.name === "subscriptions") {
      res.send({
        type: 5,
      });

      const subscriptionData = {
        interaction: interaction,
        discord_user_id: interaction.user.id,
      };
      get_destination_id(subscriptionData, res);
    } else if (interaction.data.name === "subscribe") {
      res.send({
        type: 5,
      });

      const streamer_name = interaction.data.options.find(
        (option) => option.name === "streamer",
      ).value;

      const platform = interaction.data.options.find(
        (option) => option.name === "platform",
      ).value;

      const subscriptionData = {
        interaction: interaction,
        streamer_name: streamer_name,
        dm_channel_id: interaction.channel.id,
        action: "subscribe",
        discord_user_id: interaction.user.id,
        platform: platform,
      };

      if (platform == "twitch") {
        get_twitch_user_id(subscriptionData, res);
      } else if (platform == "kick") {
        get_kick_user_id(subscriptionData, res);
      }
    } else if (interaction.data.name === "unsubscribe") {
      res.send({
        type: 5,
      });

      const streamer_name = interaction.data.options.find(
        (option) => option.name === "streamer",
      ).value;

      const platform = interaction.data.options.find(
        (option) => option.name === "platform",
      ).value;

      const subscriptionData = {
        interaction: interaction,
        streamer_name: streamer_name,
        dm_channel_id: interaction.channel.id,
        action: "unsubscribe",
        discord_user_id: interaction.user.id,
        platform: platform,
      };

      if (platform == "twitch") {
        get_twitch_user_id(subscriptionData, res);
      } else if (platform == "kick") {
        get_kick_user_id(subscriptionData, res);
      }
    }
  }

  if (interaction.type === 3) {
    if (interaction.data.custom_id === "get_started") {
      get_private_thread_id(interaction.member.user.id);
      res.send({
        type: 6,
      });
    }
  }
});

app.listen(port, function () {
  console.log(`App listening at ${port}`);
});
