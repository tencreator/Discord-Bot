const mongoose = require('mongoose');

const Schema = new mongoose.Schema({
    user_id: String,
    message_id: String,
    stream_id: String
});

module.exports = mongoose.model("twitchStreams", Schema);