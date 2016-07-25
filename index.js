var audioCtx = new window.AudioContext();
var wavelyricApp = angular.module('wavelyricApp', []);

var spaceText = '<space>';

wavelyricApp.controller('WavelyricCtrl', function ($scope) {
	window.$scope = $scope;
	$scope.stage = 'start';
	$scope.dropZone = document.getElementById('dropZone');
	$scope.tab = 'metadata';

	$scope.waveform = null;
	$scope.lineEditor = null;

	$scope.activeWordEditor = null;
	$scope.editingLine = null;

	$scope.metadata = {
		language: 'EN',
		difficulty: '1'
	};

	$scope.lines = [];
	$scope.markers = [];
	$scope.currentMarker = null;
	$scope.spaces = 0;

	$scope.wordTimings = [];

	$scope.oggQuality = '0.5';

	registerEventListeners($scope.dropZone, $scope);

	$scope.$watch('tab', function (newTab, oldTab) {
		if (newTab === 'lineTiming') {
			$scope.lineEditor = new MarkerEditor(document.getElementById('lineTimingCanvas'), audioCtx, $scope.waveform, 0, $scope.waveform.length, 18, 10);
			$scope.lineEditor.onChangeCurrentMarker = $scope.onChangeCurrentMarker;
			$scope.lineEditor.onShiftClickMarker = $scope.onShiftClickMarker;
			$scope.lineEditor.onMoveMarker = $scope.onMoveMarker;
			$scope.lineEditor.markers = $scope.markers;
			$scope.registerLineTimingListeners();
		} else if (oldTab === 'lineTiming') {
			$scope.lineEditor.destroy();
			delete $scope.lineEditor;
			$scope.unRegisterLineTimingListeners();
			$scope.lineEditor = null;
		}

		if (oldTab === 'wordTiming') {
			$scope.destroyActiveWordEditor();
		}
	});

	$scope.lineTimingListeners = {
		keydown: function (e) {
			if ($scope.editingCurrentLine) {
				return;
			}

			let caught = true;

			if (e.shiftKey) {
				$scope.holdingShift = true;
				$scope.$apply();
			}

			if (e.keyCode === 32) {	// space
				if ($scope.lineEditor.playing) {
					$scope.lineEditor.stop();
				} else {
					$scope.lineEditor.play();
				}
			} else if (e.keyCode === 78) {	// n
				$scope.setNextMarker();
			} else if (e.keyCode === 83) {	// s
				$scope.addSpace();
			} else if (e.keyCode === 33) {	// page up
				if ($scope.currentMarker > 0) {
					$scope.lineEditor.cursor = $scope.markers[$scope.currentMarker - 1].position;
				}
				$scope.lineEditor.scrollToCursor();
			} else if (e.keyCode === 34) {	// page down
				if ($scope.currentMarker < $scope.markers.length - 1) {
					$scope.lineEditor.cursor = $scope.markers[$scope.currentMarker + 1].position;
				}
				$scope.lineEditor.scrollToCursor();
			} else if (e.keyCode === 37) {	// left arrow
				$scope.lineEditor.cursor -= 10 / $scope.lineEditor.zoomLevel;
				if ($scope.lineEditor.cursor < 0) {
					$scope.lineEditor.cursor = 0;
				}
				$scope.lineEditor.scrollToCursor();
			} else if (e.keyCode === 39) {	// right arrow
				$scope.lineEditor.cursor += 10 / $scope.lineEditor.zoomLevel;
				if ($scope.lineEditor.cursor > $scope.waveform.length) {
					$scope.lineEditor.cursor = $scope.waveform.length;
				}
				$scope.lineEditor.scrollToCursor();
			} else if (e.keyCode === 36) {	// home
				$scope.lineEditor.cursor = 0;
				$scope.lineEditor.scrollToCursor();
			} else if (e.keyCode === 35) {	// end
				$scope.lineEditor.cursor = $scope.waveform.length;
				$scope.lineEditor.scrollToCursor();
			} else {
				caught = false;
			}

			if (caught) {
				e.stopPropagation();
				e.preventDefault();
			}
		},

		keyup: function (e) {
			if (!e.shiftKey) {
				$scope.holdingShift = false;
				$scope.$apply();
			}
		}
	};

	$scope.wordTimingListeners = {
		keydown: function (e) {
			if (e.keyCode === 32) {	// space
				if ($scope.activeWordEditor.playing) {
					$scope.activeWordEditor.stop();
				} else {
					$scope.activeWordEditor.play();
				}

				e.stopPropagation();
				e.preventDefault();
			}
		}
	};

	$scope.registerLineTimingListeners = function () {
		document.addEventListener('keydown', $scope.lineTimingListeners.keydown);
		document.addEventListener('keyup', $scope.lineTimingListeners.keyup);
	};

	$scope.unRegisterLineTimingListeners = function () {
		document.removeEventListener('keydown', $scope.lineTimingListeners.keydown);
		document.removeEventListener('keyup', $scope.lineTimingListeners.keyup);
	};
	
	$scope.registerWordTimingListeners = function () {
		document.addEventListener('keydown', $scope.wordTimingListeners.keydown);
	};

	$scope.unRegisterWordTimingListeners = function () {
		document.removeEventListener('keydown', $scope.wordTimingListeners.keydown);
	};

	$scope.setNextMarker = function () {
		var placeMarker = -1;
		for (var i = 0; i < $scope.markers.length; i++) {
			if ($scope.markers[i].position > $scope.lineEditor.cursor) {
				placeMarker = i;
				break;
			}
		}

		if (placeMarker !== -1) {
			if ($scope.lineEditor.cursor >
				$scope.lineEditor.startTime + $scope.lineEditor.length
				- $scope.lineEditor.minimumMarkerDistance * ($scope.markers.length - placeMarker)) {
				return;
			}

			var position = $scope.lineEditor.cursor;
			if (placeMarker !== 0) {
				if (position - $scope.markers[placeMarker - 1].position < $scope.lineEditor.minimumMarkerDistance) {
					position = $scope.markers[placeMarker - 1].position + $scope.lineEditor.minimumMarkerDistance;
					// no need to do the greaterIterator stuff, because that position should never be able to happen in the first place
				}
			}
			$scope.markers[placeMarker].position = position;
			$scope.onMoveMarker(placeMarker);
		} else {
			if ($scope.markers.length - $scope.spaces === $scope.lines.length) {
				return;
			}

			var position = $scope.lineEditor.cursor;
			if ($scope.markers.length !== 0) {
				if (position - $scope.markers[$scope.markers.length - 1].position < $scope.lineEditor.minimumMarkerDistance) {
					position = $scope.markers[$scope.markers.length - 1].position + $scope.lineEditor.minimumMarkerDistance;
				}
				if (position > $scope.lineEditor.startTime + $scope.lineEditor.length) {
					return;
				}
			}
			$scope.markers.push({
				text: $scope.lines[$scope.markers.length - $scope.spaces],
				position: position
			});
			if ($scope.markers.length > 1) {
				$scope.resetWordTiming($scope.markers.length - 2);
			}
			if ($scope.markers.length - $scope.spaces === $scope.lines.length) {
				$scope.resetWordTiming($scope.markers.length - 1);
			}
		}

		$scope.$apply();
	};

	$scope.addSpace = function () {
		if ($scope.currentMarker !== null) {
			if ($scope.markers[$scope.currentMarker].space) {
				return;
			}
		}

		var afterCursor = -1;
		for (var i = 0; i < $scope.markers.length; i++) {
			if ($scope.markers[i].position > $scope.lineEditor.cursor) {
				afterCursor = i;
				break;
			}
		}

		var position = $scope.lineEditor.cursor;
		if ($scope.currentMarker !== null && position - $scope.markers[$scope.currentMarker].position < $scope.lineEditor.minimumMarkerDistance) {
			position = $scope.markers[$scope.currentMarker].position + $scope.lineEditor.minimumMarkerDistance;
		}

		if (afterCursor !== -1) {
			if ($scope.markers[afterCursor].position - $scope.lineEditor.cursor < $scope.lineEditor.minimumMarkerDistance) {
				return;
			}

			if ($scope.markers[afterCursor].space) {
				$scope.markers.splice(afterCursor, 1);
				$scope.spaces--;
			}

			if ($scope.markers.length > afterCursor
				&& afterCursor > 0
				&& $scope.markers[afterCursor].position - $scope.markers[afterCursor - 1].position < $scope.lineEditor.minimumMarkerDistance * 2) {
				return;
			}

			$scope.markers.splice(afterCursor, 0, {
				text: spaceText,
				position: position,
				space: true
			});
			if (afterCursor > 0) {
				$scope.resetWordTiming(afterCursor - 1);
			}
			$scope.spaces++;
		} else {
			$scope.markers.push({
				text: spaceText,
				position: position,
				space: true
			});
			$scope.spaces++;
			if ($scope.markers.length > 1) {
				$scope.resetWordTiming($scope.markers.length - 2);
			}
		}
	};

	$scope.showCurrentLine = function () {
		if ($scope.currentMarker === null) {
			return [];
		} else {
			return $scope.markers[$scope.currentMarker].text.split(' ');
		}
	};

	$scope.showPreviousLine = function () {
		if ($scope.currentMarker === null || $scope.currentMarker === 0) {
			return '';
		} else {
			return $scope.markers[$scope.currentMarker - 1].text;
		}
	};

	$scope.showNextLine = function () {
		if ($scope.currentMarker === null) {
			if ($scope.lines.length > 0) {
				return $scope.lines[0];
			} else {
				return '';
			}
		}

		if ($scope.currentMarker === $scope.markers.length - 1) {
			if ($scope.markers.length - $scope.spaces === $scope.lines.length) {
				return '';
			} else {
				return $scope.lines[$scope.markers.length - $scope.spaces];
			}
		} else {
			return $scope.markers[$scope.currentMarker + 1].text;
		}
	};

	$scope.loadLyrics = function () {
		var lineArray = $scope.lyricsField.split('\n');
		$scope.lines = lineArray.filter(function (line) {
			return line !== ''
		}).map(function (line) {
			return line.trim();
		});
		$scope.stage = 'main';
	};

	$scope.onChangeCurrentMarker = function (newMarker, oldMarker) {
		$scope.cancelEditingText();

		$scope.currentMarker = newMarker;
		$scope.$apply();
	};

	$scope.onShiftClickMarker = function (marker) {
		if ($scope.markers[marker].space) {
			$scope.markers.splice(marker, 1);
			$scope.spaces--;

			if (marker > 0) {
				$scope.resetWordTiming(marker - 1);
			}
		} else if (marker > 0 && $scope.markers[marker - 1].space) {
			return;
		} else {
			let lyricIndex = 0;
			for (let i = 0; i < marker; i++) {
				if (!$scope.markers[i].space) {
					lyricIndex++;
				}
			}

			if (lyricIndex !== 0) {
				$scope.lines[lyricIndex - 1] += ' ' + $scope.lines[lyricIndex];
				$scope.markers[marker - 1].text = $scope.lines[lyricIndex - 1];

				$scope.lines.splice(lyricIndex, 1);
				$scope.markers.splice(marker, 1);

				$scope.mergeWordTimings(marker - 1, lyricIndex - 1);
			}
		}
	};

	$scope.onMoveMarker = function (marker) {
		if (marker !== 0) {
			$scope.resetWordTiming(marker - 1);
		}
		
		$scope.resetWordTiming(marker);
	};

	$scope.resetWordTiming = function (marker) {
		if ($scope.markers[marker].space) {
			return;
		}

		var markerLength;

		if (marker === $scope.markers.length - 1) {
			if ($scope.markers.length - $scope.spaces !== $scope.lines.length) {
				let lyricIndex = marker - $scope.spaces;
				$scope.wordTimings.splice(lyricIndex, 1);
				return;
			} else {
				markerLength = $scope.lineEditor.length + $scope.lineEditor.startTime - $scope.markers[marker].position;
			}
		} else {
			markerLength = $scope.markers[marker + 1].position - $scope.markers[marker].position;
		}

		let lyricIndex = $scope.lyricIndexFromMarkerIndex(marker);

		$scope.wordTimings[lyricIndex] = [];
		let wordCount = $scope.markers[marker].text.split(' ').length;		
		for (let i = 0; i < wordCount; i++) {
			$scope.wordTimings[lyricIndex][i] = $scope.markers[marker].position + i * markerLength / wordCount;
		}
	};

	$scope.lyricIndexFromMarkerIndex = function (marker) {
		var lyricIndex = -1;
		for (let i = 0; i <= marker; i++) {
			if (!$scope.markers[i].space) {
				lyricIndex++;
			}
		}

		return lyricIndex;
	};

	$scope.mergeWordTimings = function (marker, lyricIndex) {
		if (marker === $scope.markers.length - 1) {
			if ($scope.markers.length - $scope.spaces !== $scope.lines.length) {
				$scope.wordTimings.splice(lyricIndex, 1);
				return;
			}
		}

		$scope.wordTimings[lyricIndex] = $scope.wordTimings[lyricIndex].concat($scope.wordTimings[lyricIndex + 1]);
		$scope.wordTimings.splice(lyricIndex + 1, 1);
	};

	$scope.destroyActiveWordEditor = function () {
		if ($scope.activeWordEditor !== null) {
			$scope.activeWordEditor.destroy();
			delete $scope.activeWordEditor;
			$scope.unRegisterWordTimingListeners();
			$scope.activeWordEditor = null;
			$scope.editingLine = null;
		}
	};

	$scope.clickLine = function (index) {
		if ($scope.editingLine === index) {
			$scope.destroyActiveWordEditor();
		} else {
			$scope.editLine(index);
		}
	};

	$scope.editLine = function (lyricIndex) {
		$scope.destroyActiveWordEditor();
		$scope.editingLine = lyricIndex;

		let currentLyric = 0;
		let markerIndex = 0;
		while (currentLyric < lyricIndex) {
			markerIndex++;
			if (!$scope.markers[markerIndex].space) {
				currentLyric++;
			}
		}

		let canvas = document.getElementById('wordEditor-' + lyricIndex);
		let startTime = $scope.markers[markerIndex].position;
		let length;
		if (markerIndex < $scope.markers.length - 1) {
			length = $scope.markers[markerIndex + 1].position - startTime;
		} else {
			length = $scope.waveform.length - startTime;
		}

		if (length * $scope.waveform.maxResolution < 900) {
			canvas.width = length * $scope.waveform.maxResolution;
		}

		$scope.activeWordEditor = new MarkerEditor(canvas, audioCtx, $scope.waveform, startTime, length, 36, 20);
		$scope.registerWordTimingListeners();
		$scope.activeWordEditor.firstMarkerLocked = true;
		$scope.activeWordEditor.onMoveMarker = $scope.wordMove;

		let words = $scope.lines[$scope.editingLine].split(' ');
		for (let i = 0; i < words.length; i++) {
			$scope.activeWordEditor.markers.push({
				text: words[i],
				position: $scope.wordTimings[$scope.editingLine][i]
			})
		}
	};

	$scope.wordMove = function () {
		for (let i = 0; i < $scope.activeWordEditor.markers.length; i++) {
			$scope.wordTimings[$scope.editingLine][i] = $scope.activeWordEditor.markers[i].position;
		}
	};

	$scope.editLineText = function () {
		if ($scope.markers[$scope.currentMarker].space) {
			return;
		}

		if ($scope.holdingShift) {
			return;
		}

		$scope.textEditMarker = $scope.currentMarker;
		$scope.editingCurrentLine = true;
		$scope.currentLineInput = $scope.markers[$scope.currentMarker].text;

		window.setTimeout(function () {
			document.getElementById('currentLineInput').focus();
		}, 0);
	};

	$scope.saveEditingText = function () {
		if (!$scope.editingCurrentLine) {
			return;
		}

		var lyricIndex = $scope.lyricIndexFromMarkerIndex($scope.textEditMarker);
		var oldMarkerText = $scope.markers[$scope.textEditMarker].text;

		$scope.markers[$scope.textEditMarker].text = $scope.currentLineInput;
		$scope.lines[lyricIndex] = $scope.currentLineInput;

		if (oldMarkerText.split(' ').length !== $scope.currentLineInput.split(' ').length
			&& $scope.wordTimings[lyricIndex]) {
			$scope.resetWordTiming($scope.textEditMarker);
		}

		$scope.editingCurrentLine = false;
	};

	$scope.cancelEditingText = function () {
		$scope.editingCurrentLine = false;
	};

	$scope.splitAtWord = function (e, index) {
		if ($scope.markers[$scope.currentMarker].space) {
			return;
		}

		if (!$scope.holdingShift) {
			return;
		}

		let lyricIndex = $scope.lyricIndexFromMarkerIndex($scope.currentMarker);

		let newPosition;
		let mustResetWordTiming = false;

		if (!$scope.wordTimings[lyricIndex]) {
			if ($scope.lineEditor.cursor >= $scope.markers[$scope.markers.length - 1].position + $scope.lineEditor.minimumMarkerDistance) {
				newPosition = $scope.lineEditor.cursor;
				mustResetWordTiming = true;
			} else {
				return;
			}
		} else {
			$scope.wordTimings.splice(lyricIndex + 1, 0, $scope.wordTimings[lyricIndex].slice(index));
			$scope.wordTimings[lyricIndex] = $scope.wordTimings[lyricIndex].slice(0, index);
			newPosition = $scope.wordTimings[lyricIndex + 1][0];
		}

		let lineText = $scope.lines[lyricIndex];
		let words = lineText.split(' ');
		let firstHalf = words.slice(0, index).join(' ');
		let secondHalf = words.slice(index).join(' ');
		$scope.lines[lyricIndex] = firstHalf;
		$scope.lines.splice(lyricIndex + 1, 0, secondHalf);

		$scope.markers[$scope.currentMarker].text = firstHalf;

		$scope.markers.splice($scope.currentMarker + 1, 0, {
			text: secondHalf,
			position: newPosition
		});

		if (mustResetWordTiming) {
			$scope.resetWordTiming(lyricIndex);
		}

		e.stopPropagation();
		e.preventDefault();
		document.getSelection().removeAllRanges();
	};

	$scope.toJSON = function () {
		return JSON.stringify({
			"version": 1,
			"metadata": $scope.metadata,
			"lines": $scope.lines,
			"markers": $scope.markers,
			"wordTimings": $scope.wordTimings
		});
	};

	$scope.showJSON = function () {
		$scope.showExportArea = true;
		$scope.exportArea = $scope.toJSON();
	};

	$scope.saveJSON = function () {
		$scope.saveTextFile($scope.toJSON(), '.json', 'application/json');
	};

	$scope.showStenoHero = function () {
		$scope.showExportArea = true;
		$scope.exportArea = $scope.toStenoHero();
	};

	$scope.saveStenoHero = function () {
		$scope.saveTextFile($scope.toStenoHero(), '.lrc', 'text/plain');
	};

	$scope.saveTextFile = function (content, extension, mime) {
		var title = undefined;
		if ($scope.metadata.title) {
			title = $scope.metadata.title + extension;
		}

		saveAs(
			new Blob(
				[content],
				{type: mime + ';charset=utf-8'}
			),
			title
		);
	};

	$scope.toStenoHero = function () {
		var outString = '';

		// header
		outString += '[ti:' + $scope.metadata.title + ']\n';
		outString += '[ar:' + $scope.metadata.artist + ']\n';
		outString += '[al:' + $scope.metadata.album + ']\n';
		outString += '[art: ' + $scope.metadata.art + ']\n';
		outString += '[la:' + $scope.metadata.language + ']\n';
		outString += '[length: ' + Formatter.formatSeconds($scope.waveform.length, true) + ']\n';
		outString += '[dif: ' + $scope.metadata.difficulty + ']\n';
		outString += '[relyear: ' + $scope.metadata.year + ']\n';
		outString += '[file: ' + $scope.metadata.file + ']\n';

		var lyricIndex = 0;
		for (var i = 0; i < $scope.markers.length; i++) {
			if ($scope.markers[i].space) {
				outString += '{' + Formatter.formatSeconds($scope.markers[i].position, true) + '}';
			} else {
				outString += '\n';
				outString += '[' + Formatter.formatSeconds($scope.markers[i].position, true) + ']';
				let words = $scope.lines[lyricIndex].split(' ');
				if (words.length > 0) {
					outString += words[0];
				}
				if (words.length > 1) {
					outString += ' ';
					for (let w = 1; w < words.length; w++) {
						outString += '<' + Formatter.formatSeconds($scope.wordTimings[lyricIndex][w], true) + '>' + words[w];
						if (w !== words.length - 1) {
							outString += ' ';
						}
					}
				}
				lyricIndex++;
			}
		}

		return outString;
	};

	$scope.fromJSON = function (jsonObject) {
		$scope.metadata = jsonObject.metadata;
		$scope.lines = jsonObject.lines;
		$scope.markers = jsonObject.markers;
		$scope.wordTimings = jsonObject.wordTimings;

		$scope.spaces = 0;
		for (var i = 0; i < $scope.markers.length; i++) {
			if ($scope.markers[i].space) {
				$scope.spaces++;
			}
			$scope.markers[i].hovering = false;
		}
	};

	$scope.fromStenoHero = function (stenoHeroString) {
		$scope.spaces = 0;
		$scope.metadata = {};
		$scope.markers = [];
		$scope.lines = [];
		$scope.wordTimings = [];

		var tryMatchMetadata = function (line) {
			var metadataKeys = {
				'ti': 'title',
				'ar': 'artist',
				'al': 'album',
				'art': 'art',
				'la': 'language',
				'length': 'length',
				'dif': 'difficulty',
				'relyear': 'year',
				'file': 'file'
			};

			for (var key in metadataKeys) {
				if (line.substring(0, key.length + 2) === '[' + key + ':') {
					return [metadataKeys[key], line.substring(key.length + 2, line.length - 1).trim()];
				}
			}

			return null;
		};

		var getLineData = function (line) {
			// assume there is no more than one space on a line	(and that it is at the end of the line)
			var spaceMatch = line.match(/\{([^}]+)\}/);
			var space = null;
			if (spaceMatch) {
				space = Formatter.parseTimecodeString(spaceMatch[1]);
				line = line.substring(0, line.indexOf('{'));
			}
			line = line.replace('[', '<').replace(']', '>');

			var wordParts = line.split(' ');

			var words = [];
			var wordTimings = [];

			for (let wordPart of wordParts) {
				let closeTimecodeIndex = wordPart.indexOf('>');
				let timecode = wordPart.substring(1, closeTimecodeIndex);
				let word = wordPart.substring(closeTimecodeIndex + 1).trim();

				words.push(word);
				wordTimings.push(Formatter.parseTimecodeString(timecode));
			}

			return [words, wordTimings, space];
		};

		var lines = stenoHeroString.split('\n').filter(function (line) {
			return line.trim() !== '';
		});

		for (var line of lines) {
			let meta = tryMatchMetadata(line);
			if (meta) {
				$scope.metadata[meta[0]] = meta[1];
			} else {
				let data = getLineData(line);
				if (data[0].length > 0) {
					$scope.markers.push({
						text: data[0].join(' '),
						position: data[1][0]
					});
					$scope.lines.push(data[0].join(' '));
					$scope.wordTimings.push(data[1]);
				}

				if (data[2]) {
					$scope.markers.push({
						text: spaceText,
						position: data[2],
						space: true
					});

					$scope.spaces++;
				}
			}
		}
	};

	$scope.import = function () {
		try {
			var json = JSON.parse($scope.importField);
			$scope.fromJSON(json);
		} catch (e) {
			$scope.fromStenoHero($scope.importField);
		}

		$scope.stage = 'main';
	};

	$scope.beginOggExport = function () {
		$scope.oggExportInProgress = true;

		$scope.oggEncoder.encode(parseFloat($scope.oggQuality)).then(function (blob) {
			$scope.oggExportInProgress = false;

			let title = undefined;
			if ($scope.metadata.title) {
				title = $scope.metadata.title + '.ogg'
			};
			saveAs(blob, title);

			$scope.$apply();
		});
	};
});

var registerEventListeners = function (dropZone, $scope) {
	dropZone.ondragover = function (e) {
		e.stopPropagation();
		e.preventDefault();

		e.dataTransfer.dropEffect = 'copy';	
	};

	dropZone.ondragenter = function (e) {
		if (e.target === $scope.dropZone) {
			$scope.draggingFile = true;
			$scope.$apply();
		}
	};

	dropZone.ondragleave = function (e) {
		if (e.target === $scope.dropZone) {
			$scope.draggingFile = false;
			$scope.$apply();
		}
	};

	dropZone.ondrop = function (e) {
		e.stopPropagation();
		e.preventDefault();

		$scope.draggingFile = false;

		var files = e.dataTransfer.files;
		if (files.length > 0) {
			let file = files[0];

			// die if it's not an audio file
			if (!(file.type.length > 6 && file.type.substring(0, 6) === 'audio/')) {
				return;
			}

			let reader = new FileReader();

			reader.onload = function (readerEvent) {
				audioCtx.decodeAudioData(readerEvent.target.result).then(function (audioBuffer) {
					$scope.waveform = new Waveform(audioBuffer, 1000);

					// we have to construct the ogg encoder in advance so the script has time to pre-initialise.
					// this doesn't create an actual encoder object, but does set up the web worker.
					$scope.oggEncoder = new OggEncoder(audioBuffer);

					$scope.stage = 'newOrImport';
					$scope.$apply();
				});
			};

			reader.readAsArrayBuffer(file);
			$scope.stage = 'loading';
			$scope.$apply();
		}
	};
};