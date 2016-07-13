importScripts('OggVorbisEncoder.min.js');

var sampleRate;
var channels;

onmessage = function (event) {
	if (event.data.command === 'initialise') {
		sampleRate = event.data.sampleRate;
		channels = event.data.channels;
	} else if (event.data.command === 'encode') {
		var encoder = new OggVorbisEncoder(sampleRate, channels.length, event.data.quality);

		for (var i = 0; i < channels[0].length; i += 512) {	// encode a second at a time
			let tmpArray = [];
			for (var j = 0; j < channels.length; j++) {
				tmpArray.push(channels[j].slice(i, i + 512));
			}
			encoder.encode(tmpArray);
		}

		postMessage(encoder.finish());
	}
};