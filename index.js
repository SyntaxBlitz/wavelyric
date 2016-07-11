var audioCtx = new window.AudioContext();
var wavelyricApp = angular.module('wavelyricApp', []);

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

	registerEventListeners($scope.dropZone, $scope);

	$scope.$watch('tab', function (newTab, oldTab) {
		if (newTab === 'lineTiming') {
			$scope.lineEditor = new MarkerEditor(document.getElementById('lineTimingCanvas'), audioCtx, $scope.waveform, 0, $scope.waveform.length);
			$scope.lineEditor.onChangeCurrentMarker = $scope.onChangeCurrentMarker;
			$scope.lineEditor.onShiftClickMarker = $scope.onShiftClickMarker;
			$scope.lineEditor.onMoveMarker = $scope.onMoveMarker;
			$scope.lineEditor.markers = $scope.markers;
			$scope.lineEditor.textHeight = 18;
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
			if (e.keyCode === 32) {	// space
				if ($scope.lineEditor.playing)
					$scope.lineEditor.stop();
				else
					$scope.lineEditor.play();

				e.stopPropagation();
				e.preventDefault();
			} else if (e.keyCode === 78) {	// n
				$scope.setNextMarker();
			} else if (e.keyCode === 83) {	// s
				$scope.addSpace();
			}
		}
	};

	$scope.wordTimingListeners = {
		keydown: function (e) {
			if (e.keyCode === 32) {	// space
				if ($scope.activeWordEditor.playing)
					$scope.activeWordEditor.stop();
				else
					$scope.activeWordEditor.play();

				e.stopPropagation();
				e.preventDefault();
			}
		}
	};

	$scope.registerLineTimingListeners = function () {
		document.addEventListener('keydown', $scope.lineTimingListeners.keydown);
	};

	$scope.unRegisterLineTimingListeners = function () {
		document.removeEventListener('keydown', $scope.lineTimingListeners.keydown);
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
			if ($scope.markers[$scope.currentMarker].space)
				return;
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
			if ($scope.markers[afterCursor].position - $scope.lineEditor.cursor < $scope.lineEditor.minimumMarkerDistance)
				return;

			if ($scope.markers[afterCursor].space) {
				$scope.markers.splice(afterCursor, 1);
				$scope.spaces--;
			}

			if ($scope.markers.length > afterCursor && afterCursor > 0 && $scope.markers[afterCursor].position - $scope.markers[afterCursor - 1].position < $scope.lineEditor.minimumMarkerDistance * 2)
				return;

			$scope.markers.splice(afterCursor, 0, {
				text: '<space>',
				position: position,
				space: true
			});
			if (afterCursor > 0) {
				$scope.resetWordTiming(afterCursor - 1);
			}
			$scope.spaces++;
		} else {
			$scope.markers.push({
				text: '<space>',
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
			return '';
		} else {
			return $scope.markers[$scope.currentMarker].text;
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
		if ($scope.currentMarker === null)
			if ($scope.lines.length > 0)
				return $scope.lines[0];
			else
				return '';

		if ($scope.currentMarker === $scope.markers.length - 1) {
			if ($scope.markers.length - $scope.spaces === $scope.lines.length) {
				return '';
			} else {
				return $scope.lines[$scope.markers.length - $scope.spaces];
			}
		} else {
			return $scope.markers[$scope.currentMarker + 1].text;
		}
	}

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
				if (!$scope.markers[i].space)
					lyricIndex++;
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

		let lyricIndex = -1;
		for (let i = 0; i <= marker; i++) {
			if (!$scope.markers[i].space)
				lyricIndex++;
		}

		$scope.wordTimings[lyricIndex] = [];
		let wordCount = $scope.markers[marker].text.split(' ').length;		
		for (let i = 0; i < wordCount; i++) {
			$scope.wordTimings[lyricIndex][i] = $scope.markers[marker].position + i * markerLength / wordCount;
		}
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
			if (!$scope.markers[markerIndex].space) 
				currentLyric++;
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

		$scope.activeWordEditor = new MarkerEditor(canvas, audioCtx, $scope.waveform, startTime, length);
		$scope.registerWordTimingListeners();
		$scope.activeWordEditor.textHeight = 36;
		$scope.activeWordEditor.lowerPadding = 20;
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

	$scope.toJSON = function () {
		return JSON.stringify({
			"version": 1,
			"metadata": $scope.metadata,
			"lines": $scope.lines,
			"markers": $scope.markers,
			"wordTimings": $scope.wordTimings
		});
	};

	$scope.fromJSON = function (jsonString) {
		let jsonObject = JSON.parse(jsonString);

		$scope.metadata = jsonObject.metadata;
		$scope.lines = jsonObject.lines;
		$scope.markers = jsonObject.markers;
		$scope.wordTimings = jsonObject.wordTimings;

		$scope.spaces = 0;
		for (var i = 0; i < $scope.markers.length; i++) {
			if ($scope.markers[i].space)
				$scope.spaces++;
		}
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

	$scope.fromStenoHero = function (stenoHeroString) {

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
					$scope.stage = 'lyrics';
					$scope.$apply();
				});
			};

			reader.readAsArrayBuffer(file);
			$scope.stage = 'loading';
			$scope.$apply();
		}
	}
}