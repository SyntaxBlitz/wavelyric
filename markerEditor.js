class MarkerEditor {
		constructor (canvas, audioCtx, waveform, startTime, length) {
			this.canvas = canvas;
			this.audioCtx = audioCtx;
			this.waveform = waveform;
			this.startTime = startTime;
			this.length = length;

			this.textHeight = 36;
			this.timecodeHeight = 10;
			this.lowerPadding = 50;
			this.textPadding = 5;
			this.markerSlack = 5;
			this.firstMarkerLocked = true;	// only to be set if the starting marker is at the same point as startTime. otherwise minimumDistance adjusts get wonky
			this.minimumMarkerDistance = 0.05;	// seconds
			this.drawingBounds = {
				x: 0,
				y: 0,
				width: canvas.width,
				height: canvas.height - this.textHeight - this.lowerPadding,
			};
			this.colours = {
				waveformColour: 'black',
				cursorColour: 'rgba(0, 128, 0, 1)',
				defaultMarkerColour: 'rgba(0, 0, 255, 1)',
				passedMarkerColour: 'rgba(0, 0, 255, .33)',
				hoveringMarkerColour: 'rgba(200, 200, 0, 1)',
				lockedMarkerColour: 'rgba(128, 128, 128, .75)'
			};

			this.totalOffset = this.startTime;
			this.startOffset = this.totalOffset;
			this.zoomLevel = this.drawingBounds.width / this.length;	// pixels per second
			this.mouseStart = 0;
			this.panning = false;
			this.cursor = 0;
			this.playing = false;
			this.listeners = {};
			this.scroll = 0;

			this.markers = [];
			this.lastHoveringMarkerIndex = null;
			this.currentlyDraggingIndex = null;
			this.onShiftClickMarker = null;
			this.dragDeltaSeconds = 0;

			this.lastFrame = 0;
			this.scrollRate = 1;

			this.canvas.focus();

			this.addEventListeners();

			window.requestAnimationFrame(this.canvasRender.bind(this));
		}

		addEventListeners () {
			this.listeners.wheel = e => {
				this.panning = false;

				if (e.deltaY < 0) {		// scroll up
					this.zoom(1.1);
				} else {
					this.zoom(1 / 1.1);
				}
			};
			this.listeners.mousedown = e => {
				this.mouseXFromCanvas = e.clientX - this.canvas.getBoundingClientRect().left;
				this.mouseYFromCanvas = e.clientY - this.canvas.getBoundingClientRect().top;
				this.mouseStart = e.clientX;

				let hoveringMarkerIndex = this.markerHover(this.mouseXFromCanvas, this.mouseYFromCanvas);
				if (hoveringMarkerIndex === null) {
					this.panning = true;
					this.startOffset = this.totalOffset;
				} else if (e.shiftKey && this.onShiftClickMarker) {
					this.onShiftClickMarker(hoveringMarkerIndex);
				} else {
					let mousePositionSeconds = this.mouseXFromCanvas / this.zoomLevel + this.totalOffset;
					this.dragDeltaSeconds = mousePositionSeconds - this.markers[hoveringMarkerIndex].position;
					this.currentlyDraggingIndex = hoveringMarkerIndex;
				}
			};
			this.listeners.mousemove = e => {
				this.mouseXFromCanvas = e.clientX - this.canvas.getBoundingClientRect().left;
				this.mouseYFromCanvas = e.clientY - this.canvas.getBoundingClientRect().top;

				if (this.panning) {
					var mouseNow = e.clientX;
					this.totalOffset = this.startOffset + (this.mouseStart - mouseNow) / this.zoomLevel;
					this.clipOffset();
				}
			};
			this.listeners.mouseup = e => {
				this.panning = false;
				if (e.clientX === this.mouseStart && !this.playing) {	// the mouse was clicked, not dragged
					if (this.currentlyDraggingIndex !== null) {
						this.cursor = this.markers[this.currentlyDraggingIndex].position;	// move the cursor to the clicked marker
					} else {
						var mouseXFromWaveform = this.mouseXFromCanvas - this.drawingBounds.x;
						this.cursor = this.totalOffset + mouseXFromWaveform / this.zoomLevel;
					}
				}
				if (this.currentlyDraggingIndex !== null) {
					this.currentlyDraggingIndex = null;
				}
			};

			this.canvas.addEventListener('wheel', this.listeners.wheel);
			this.canvas.addEventListener('mousedown', this.listeners.mousedown);
			window.addEventListener('mousemove', this.listeners.mousemove);
			window.addEventListener('mouseup', this.listeners.mouseup);
		}

		removeEventListeners() {
			this.canvas.removeEventListener('wheel', this.listeners.wheel);
			this.canvas.removeEventListener('mousedown', this.listeners.mousedown);
			window.removeEventListener('mousemove', this.listeners.mousemove);
			window.removeEventListener('mouseup', this.listeners.mouseup);
		}

		zoom (multiplier) {
			var focus = this.cursor;	// centre zoom on playing cursor

			var zoomLevelMultiplier = multiplier;
			var zoomLevelOriginal = this.zoomLevel;

			this.zoomLevel *= zoomLevelMultiplier;

			if (this.zoomLevel > this.waveform.maxResolution) {
				this.zoomLevel = this.waveform.maxResolution;
			}
			if (this.zoomLevel < this.drawingBounds.width / this.length) {
				this.zoomLevel = this.drawingBounds.width / this.length;
			}

			zoomLevelMultiplier = this.zoomLevel / zoomLevelOriginal;	// adjust in case the zoom level was clipped
			this.totalOffset = (this.totalOffset - focus) / zoomLevelMultiplier + focus;	// move the offset so we zoom centred on the cursor

			this.clipOffset();
		}

		canvasRender () {
			this.currentDelta = performance.now() - this.lastFrame;
			this.lastFrame = performance.now();

			if (this.playing) {
				this.cursor = this.audioCtx.currentTime - this.audioStartTime + this.startTimecode;
				if (this.audioCtx.currentTime - this.audioStartTime >= this.length - (this.startTimecode - this.startTime)) {
					this.stop();
				}
				this.centreCursor();
			}

			this.moveDraggable();
			this.doScroll();
			
			this.clearAll();

			this.drawWaveform();
			this.drawTimecodes();
			this.drawMarkers();
			this.drawCursor();

			window.requestAnimationFrame(this.canvasRender.bind(this));
		}

		moveDraggable() {
			if (this.currentlyDraggingIndex !== null && !(this.currentlyDraggingIndex === 0 && this.firstMarkerLocked)) {
				let currentDrag = this.markers[this.currentlyDraggingIndex];

				let lowestAllowed = this.currentlyDraggingIndex * this.minimumMarkerDistance + this.startTime;
				let highestAllowed = this.length - ((this.markers.length - 1) - this.currentlyDraggingIndex) * this.minimumMarkerDistance + this.startTime;

				currentDrag.position = this.mouseXFromCanvas / this.zoomLevel + this.totalOffset - this.dragDeltaSeconds;
				if (currentDrag.position < lowestAllowed)
					currentDrag.position = lowestAllowed;
				if (currentDrag.position > highestAllowed)
					currentDrag.position = highestAllowed;

				let lesserIterator = this.currentlyDraggingIndex - 1;
				while (lesserIterator >= 0 && this.markers[lesserIterator].position > this.markers[lesserIterator + 1].position - this.minimumMarkerDistance) {
					this.markers[lesserIterator].position = this.markers[lesserIterator + 1].position - this.minimumMarkerDistance;
					lesserIterator--;
				}

				let greaterIterator = this.currentlyDraggingIndex + 1;
				while (greaterIterator < this.markers.length && this.markers[greaterIterator].position < this.markers[greaterIterator - 1].position + this.minimumMarkerDistance) {
					this.markers[greaterIterator].position = this.markers[greaterIterator - 1].position + this.minimumMarkerDistance;
					greaterIterator++;
				}

				if (currentDrag.position < this.totalOffset) {
					this.scroll = -1;
				} else if (currentDrag.position > this.totalOffset + (this.drawingBounds.width / this.zoomLevel)) {
					this.scroll = 1;
				} else {
					this.scroll = 0;
				}
			}
		}

		doScroll () {
			if (this.scroll !== 0) {
				this.totalOffset += this.scroll * this.scrollRate * this.currentDelta / this.zoomLevel;
				this.clipOffset();
			}
		}

		clearAll () {
			this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
		}

		drawWaveform () {
			this.canvas.getContext('2d').fillStyle = this.colours.waveformColour;
			this.waveform.drawWaveform(this.canvas, this.totalOffset, this.drawingBounds.width / this.zoomLevel, this.drawingBounds.x, this.drawingBounds.y, this.drawingBounds.width, this.drawingBounds.height);
		}

		drawTimecodes () {
			var context = this.canvas.getContext('2d');
			context.fillStyle = 'black';
			context.font = this.timecodeHeight + 'px sans-serif';

			var startTimecode = this.formatSeconds(this.totalOffset);
			var endTimecode = this.formatSeconds(this.totalOffset + this.drawingBounds.width / this.zoomLevel);
			var endTimecodeWidth = context.measureText(endTimecode).width;

			context.fillText(startTimecode, this.drawingBounds.x, this.drawingBounds.y + this.drawingBounds.height + this.timecodeHeight);
			context.fillText(endTimecode, this.drawingBounds.x + this.drawingBounds.width - endTimecodeWidth, this.drawingBounds.height + this.timecodeHeight);
		}

		formatSeconds (seconds) {
			var secondsOutput = '' + (seconds % 60);
			if (seconds % 60 < 10)
				secondsOutput = '0' + secondsOutput;
			if (secondsOutput.length === 2)
				secondsOutput += '.00';
			else if (secondsOutput.length === 4)
				secondsOutput += '0';

			if (secondsOutput.length > 5)
				secondsOutput = secondsOutput.substring(0, 5);

			var minutes = Math.floor(seconds / 60);

			var output = minutes + ':' + secondsOutput;

			return output;
		}

		drawMarkers() {
			// this method does make some assumptions about the drawing bounds:
			// 	the waveform takes up the entire horizontal span of the canvas
			//	the waveform is at the top of the canvas
			// 	this.drawingBounds.height + this.textHeight + this.lowerPadding == this.canvas.height

			var context = this.canvas.getContext('2d');

			let currentHoveringMarkerIndex = this.markerHover(this.mouseXFromCanvas, this.mouseYFromCanvas);
			if (this.lastHoveringMarkerIndex !== null) {
				this.markers[this.lastHoveringMarkerIndex].hovering = false;
			}
			this.lastHoveringMarkerIndex = currentHoveringMarkerIndex;
			if (currentHoveringMarkerIndex !== null) {
				document.body.style.cursor = 'pointer';
				this.markers[currentHoveringMarkerIndex].hovering = true;
			} else {
				document.body.style.cursor = 'auto';
			}

			for (var i = 0; i < this.markers.length; i++) {
				let marker = this.markers[i];

				if (i === 0 && this.firstMarkerLocked)
					context.fillStyle = this.colours.lockedMarkerColour;
				else if (marker.hovering)
					context.fillStyle = this.colours.hoveringMarkerColour;
				else if (marker.position > this.cursor)
					context.fillStyle = this.colours.defaultMarkerColour;
				else
					context.fillStyle = this.colours.passedMarkerColour;

				var markerX = (marker.position - this.totalOffset) * this.zoomLevel;
				if (Math.abs(marker.position - this.length - this.startTime) < 1e-6) {	// if they're equal (floats)
					markerX -= 1;
				}
				context.fillRect(markerX, 0, 1, this.drawingBounds.height + this.textHeight);

				context.font = this.textHeight + 'px sans-serif';
				if (i === this.markers.length - 1) {
					context.fillText(marker.text, markerX + this.textPadding, this.drawingBounds.height + this.textHeight);
				} else {
					var maxTextWidth = (this.markers[i + 1].position - marker.position) * this.zoomLevel - this.textPadding * 2;

					let text = marker.text;
					let chars = marker.text.length;
					while (context.measureText(text).width > maxTextWidth) {
						chars--;
						if (chars <= 0) {
							text = '';
							break;
						}
						text = marker.text.substring(0, chars) + '...';
					}
					context.fillText(text, markerX + this.textPadding, this.drawingBounds.height + this.textHeight);
				}
			}
		}

		markerHover (mouseX, mouseY) {
			if (mouseX > this.drawingBounds.width || this.markers.length === 0)
				return null;

			// assert this.markers is sorted by ascending position
			var mouseSeconds = mouseX / this.zoomLevel + this.totalOffset;
			var closestDistance = this.length;
			var closestDistanceIndex = this.markers.length - 1;

			var chosenMarkerIndex = null;
			for (let i = 0; i < this.markers.length; i++) {
				let markerDistance = Math.abs(this.markers[i].position - mouseSeconds);
				if (markerDistance < closestDistance) {
					closestDistance = markerDistance;
				} else {
					closestDistanceIndex = i - 1;
					break;
				}
			}

			if (closestDistance * this.zoomLevel < this.markerSlack) {
				chosenMarkerIndex = closestDistanceIndex;
			}

			if (chosenMarkerIndex === null && mouseY > this.drawingBounds.height && mouseY <= this.drawingBounds.height + this.textHeight) {
				let lastMarkerToLeftIndex = this.markers.length - 1;
				for (let i = 0; i < this.markers.length; i++) {
					if (this.markers[i].position < mouseSeconds) {
						lastMarkerToLeftIndex = i;
					} else {
						break;
					}
				}

				let context = this.canvas.getContext('2d');
				context.font = this.textHeight + 'px sans-serif';
				let textWidth = context.measureText(this.markers[lastMarkerToLeftIndex].text).width;
				if (mouseX < (this.markers[lastMarkerToLeftIndex].position - this.totalOffset) * this.zoomLevel + this.textPadding + textWidth) {
					chosenMarkerIndex = lastMarkerToLeftIndex;
				}
			}

			return chosenMarkerIndex;
		}

		drawCursor () {
			var cursorX = (this.cursor - this.totalOffset) * this.zoomLevel + this.drawingBounds.x;
			if (cursorX >= this.drawingBounds.x && cursorX <= this.drawingBounds.x + this.drawingBounds.width) {
				this.canvas.getContext('2d').fillStyle = this.colours.cursorColour;
				this.canvas.getContext('2d').fillRect(cursorX, this.drawingBounds.y, 1, this.drawingBounds.height);
			}
		}

		clipOffset () {
			if (this.totalOffset > this.length - this.drawingBounds.width / this.zoomLevel + this.startTime)
				this.totalOffset = this.length - this.drawingBounds.width / this.zoomLevel + this.startTime;
			if (this.totalOffset < this.startTime)
				this.totalOffset = this.startTime;
		};

		centreCursor () {
			var secondsOnScreen = this.drawingBounds.width / this.zoomLevel;
			this.totalOffset = this.cursor - secondsOnScreen / 2;
			this.clipOffset();
		};

		play () {
			if (this.playing)
				return;

			this.playing = true;

			this.source = this.audioCtx.createBufferSource();
			this.source.buffer = this.waveform.buffer;
			this.source.connect(this.audioCtx.destination);
			this.source.start(0, this.cursor);

			this.audioStartTime = this.audioCtx.currentTime;
			this.startTimecode = this.cursor;
		}

		stop () {
			if (!this.playing)
				return;

			this.playing = false;
			this.source.stop();

			if (this.cursor >= this.startTime + this.length - 1e-6) {
				this.cursor = this.startTimecode;
			}
		}
	}