class OggEncoder {
	constructor (audioBuffer) {
		this.audioBuffer = audioBuffer;
		this.channelBuffers = [];

		for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
			this.channelBuffers.push(audioBuffer.getChannelData(i));
		}

		this.worker = new Worker('oggWorker.js');
		this.worker.postMessage({
			command: 'initialise',
			sampleRate: this.audioBuffer.sampleRate,
			channels: this.channelBuffers,
		});
	}

	encode (quality) {
		this.worker.postMessage({
			command: 'encode',
			quality: quality
		});

		return new Promise((resolve, reject) => {
			this.worker.onmessage = function (event) {
				if (event.data) {
					resolve(event.data);
				} else {
					reject();
				}
			};
		});
	}
}