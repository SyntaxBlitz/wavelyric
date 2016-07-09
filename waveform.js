class Waveform {
	constructor (arrayBuffer, maxResolution) {
		this.buffer = arrayBuffer;
		this.maxResolution = maxResolution;
		this.summarize(maxResolution);
		
		console.log('waveform constructed');
	}

	summarize (pixelsPerSecond) {
		var data = this.data;
		var scaleFactor = Math.floor(data[0].length / (pixelsPerSecond * this.length));

		this.summaryMins = new Float32Array(Math.ceil(data[0].length / scaleFactor));
		this.summaryMaxes = new Float32Array(Math.ceil(data[0].length / scaleFactor));

		for (var i = 0; i < this.summaryMins.length; i++) {
			var currentMin = 1;
			var currentMax = -1;

			for (var j = 0; j < scaleFactor; j++) {
				var n = i * scaleFactor + j;
				if (n < data[0].length) {
					var sample = (data[0][n] + data[1][n]) / 2;
					if (sample < currentMin)
						currentMin = sample;
					if (sample > currentMax)
						currentMax = sample;
				} else {
					break;
				}
			}

			if (currentMin < -1)	// this happens!
				currentMin = -1;
			if (currentMax > 1)
				currentMax = 1;

			this.summaryMins[i] = currentMin;
			this.summaryMaxes[i] = currentMax;
		}
	}

	summarizeFurther (pixels, startTime, length) {
		if (!this.summaryMins || !this.summaryMaxes)
			return;

		var newMins = new Float32Array(pixels);
		var newMaxes = new Float32Array(pixels);

		var lengthSummaryFrames = Math.floor(length * this.maxResolution);
		var lengthSampleFrames = Math.floor(length * this.buffer.sampleRate);

		var offset, lengthFrames, resolution;
		var useSummaryFrames;

		if (lengthSampleFrames < pixels) {
			resolution = this.buffer.sampleRate;
			offset = Math.floor(startTime * resolution);
			lengthFrames = Math.floor(length * resolution);

			var currentPixel = 0;
			for (var i = 0; i < lengthFrames; i++) {
				while (currentPixel / pixels < (i + 1) / lengthFrames) {		// we use i + 1 so it takes a whole batch from the start
					let sample = (this.data[0][frame] + this.data[1][frame]) / 2;
					newMins[currentPixel] = sample;
					newMaxes[currentPixel] = sample;
					currentPixel++;
				}
			}

			return [newMins, newMaxes];
		} else if (lengthSummaryFrames < pixels) {
			resolution = this.buffer.sampleRate;
			useSummaryFrames = false;
		} else {
			resolution = this.maxResolution;
			useSummaryFrames = true;
		}

		offset = Math.floor(startTime * resolution);
		lengthFrames = Math.floor(length * resolution);
		
		var framesPerVirtualPixel = lengthFrames / pixels;
		var totalFrames = this.length * resolution;
		var virtualPixelsPerFrame = 1 / framesPerVirtualPixel;
		var totalVirtualPixels = totalFrames * virtualPixelsPerFrame;
		var initialVirtualPixel = Math.floor(startTime / this.length * totalVirtualPixels);

		var i = 0;
		for (var virtualPixel = initialVirtualPixel; virtualPixel < initialVirtualPixel + pixels; virtualPixel++) {

			// at certain bitrates there is occasionally a problem with vertical lines showing up at close zooms.
			// this is because there's not always a frame available to a virtual pixel.
			// in these cases, we copy the previous pixel.
			if (Math.floor(virtualPixel / totalVirtualPixels * totalFrames) !== Math.floor((virtualPixel + 1) / totalVirtualPixels * totalFrames)) {
				var currentMin = 1;
				var currentMax = -1;

				if (useSummaryFrames) {
					for (var frame = Math.floor(virtualPixel / totalVirtualPixels * totalFrames); frame < Math.floor((virtualPixel + 1) / totalVirtualPixels * totalFrames); frame++) {
						if (this.summaryMins[frame] < currentMin)
							currentMin = this.summaryMins[frame];
						if (this.summaryMaxes[frame] > currentMax)
							currentMax = this.summaryMaxes[frame];
					}
				} else {
					for (var frame = Math.floor(virtualPixel / totalVirtualPixels * totalFrames); frame < Math.floor((virtualPixel + 1) / totalVirtualPixels * totalFrames); frame++) {
						let sample = (this.data[0][frame] + this.data[1][frame]) / 2;
						if (sample < currentMin)
							currentMin = sample;
						if (sample > currentMax)
							currentMax = sample;
					}
				}

				newMins[i] = currentMin;
				newMaxes[i] = currentMax;
			} else if (i !== 0) {
				newMins[i] = newMins[i - 1];
				newMaxes[i] = newMaxes[i - 1];
			} else {
				newMins[i] = 0;
				newMaxes[i] = 0;
			}

			i++;
		}

		return [newMins, newMaxes];
	}

	get data() {
		if (this.buffer.numberOfChannels === 1) {
			return [this.buffer.getChannelData(0), this.buffer.getChannelData(0)];
		} else {
			return [this.buffer.getChannelData(0), this.buffer.getChannelData(1)];
		}
	}

	get length() {
		return this.buffer.length / this.buffer.sampleRate;
	}

	getImage(width, height, startTime, length) {
		var canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d').fillStyle = 'black';
		this.drawWaveform(canvas, startTime, length);
		return canvas.toDataURL();
	}

	drawWaveform(canvas, startTime, length, x, y, width, height) {
		if (x === undefined)
			x = 0;
		if (y === undefined)
			y = 0;
		if (width === undefined)
			width = canvas.width;
		if (height === undefined)
			height = canvas.height;

		var context = canvas.getContext('2d');

		if (startTime === undefined) {
			startTime = 0;
		}

		if (length === undefined) {
			length = this.length;
		}

		var pixels = this.summarizeFurther(width, startTime, length);
		
		for (var i = x; i < x + width; i++) {
			context.fillRect(i, y + -pixels[1][i] * height / 2 + height / 2, 1, (pixels[1][i] - pixels[0][i]) * height / 2);
		}
	}
}