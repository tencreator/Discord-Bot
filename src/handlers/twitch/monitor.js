const { twitch } = require('../../config/bot')
const { Stream } = require('../../database/models/twitchStream');
const chalk = require('chalk');
const fetch = require('node-fetch');
const request = require('request');
const CronJob = require('cron').CronJob;
const getKey = async () => {
    return new Promise((resolve, reject) => {
        request.post(
            `https://id.twitch.tv/oauth2/token?client_id=${twitch.client_id}&client_secret=${twitch.client_secret}&grant_type=client_credentials`,
            (error, res, body) => {
                if (error) {
                    return console.error(error)
                }
                try{
                    resolve(JSON.parse(body).access_token)
                }catch(e){
                    reject(e)
                }
            }
        )
    });
}

const get = async (url) => {
	try {
		const req = await fetch(url, {
			headers: { 'Authorization': `Bearer ${await getKey()}`, 'Client-ID': twitch.client_id },
		});


		const res = await req.json();

		return res.data.length ? res.data[0] : null;
	} catch (error) {
		return console.error(error);
	}
};

const getUser = async (user) => {
	return await get(`https://api.twitch.tv/helix/users?login=${user}`);
};

const getStream = async (user) => {
	return await get(`https://api.twitch.tv/helix/streams?user_login=${user}`);
};

const getGame = async (id) => {
	return await get(`https://api.twitch.tv/helix/games?id=${id}`);
};


module.exports = async (client) => {
	// twitch = client.config.twitch
	//? CronJob - Task Manager
	console.log(chalk.green.bold('[Twitch]') + chalk.white(' Monitoring stream'));
	new CronJob('0 * * * * *', async () => {
		//? Fetch User & Stream info - Twitch API
		const user = await getUser(twitch.streamer);
		const stream = await getStream(twitch.streamer);

		//? Get channel since we'll be using it a lot -
		const channel = client.channels.cache.get(twitch.channel_id);

		if (!stream) {
			if (!client.streams.has(channel.guild.id, user.id)) return;

			//? Get message ID from DB
			const streamData = await Stream.findOne({
				where: {
					user_id: user.id
				}
			});
			if (!streamData) return;
			//? Delete from cache
			client.streams.delete(channel.guild.id, user.id);
			//? Embed
			const embed = {
				color: twitch.embed_color,
				author: {
					name: `${user.display_name}`,
					url: `https://twitch.tv/${user.login}`,
					icon_url: user.profile_image_url
				},
				description: `Stream is offline! But you can still watch the VOD! https://twitch.tv/${twitch.streamer}`,
				image: {
					url: user.offline_image_url
				},
				footer: {
					text: client.user.username,
					icon_url: client.user.displayAvatarURL()
				},
				timestamp: new Date().toISOString()
			};
			//? Find and edit message - or send a new one
			await channel.messages
				.fetch(streamData.message_id)
				.then((msg) => msg.edit(twitch.offline_message, { embed }))
				.catch(() => channel.send(twitch.offline_message, { embed }));
			//? Delete from database
			return await streamData.destroy();
		}
		//? Get message ID from DB
		const streamData = await Stream.findOne({
			where: {
				user_id: user.id
			}
		});
		const game = await getGame(stream.game_id);
		//? I honestly don't know if I'm supposed to replace them or do something with the API call lol
		const preview = stream.thumbnail_url.replace('{width}', 1920).replace('{height}', 1080) + stream.id;
		//? Embed - as an object cause why not
		const embed = {
			color: twitch.embed_color,
			author: {
				name: `${user.display_name} is streaming on Twitch!`,
				url: `https://twitch.tv/${user.login}`,
				icon_url: user.profile_image_url
			},
			title: stream.title,
			url: `https://twitch.tv/${user.login}`,
			image: {
				url: preview
			},
			fields: [
				{
					name: 'Playing',
					value: game.name,
					inline: true
				},
				{
					name: 'Viewers',
					value: stream.viewer_count,
					inline: true
				},
				{
					name: 'Status',
					value: 'Live',
					inline: true
				}
			],
			footer: {
				text: client.user.username,
				icon_url: client.user.displayAvatarURL()
			},
			timestamp: new Date().toISOString()
		};
		//? Create and Send message if it doesn't exist
		if (!streamData) {
			client.streams.set(channel.guild.id, user.id);

			const streamMessage = await channel.send(twitch.live_message, { embed });

			return await Stream.create({
				user_id: user.id,
				stream_id: stream.id,
				message_id: streamMessage.id
			});
		}
		//? Edit - or resend
		client.streams.set(channel.guild.id, user.id);

		let streamMessage = streamData.message_id
			? await channel.messages
					.fetch(streamData.message_id)
					.then((msg) => msg.edit(twitch.live_message, { embed }))
					.catch(() => channel.send(twitch.live_message, { embed }))
			: await channel.send(twitch.live_message, { embed });
		//? Update DB
		await streamData.update({
			user_id: user.id,
			stream_id: stream.id,
			message_id: streamMessage.id
		});
	}).start();
};