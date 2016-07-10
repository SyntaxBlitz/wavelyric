var audioCtx = new window.AudioContext();
var wavelyricApp = angular.module('wavelyricApp', []);

wavelyricApp.controller('WavelyricCtrl', function ($scope) {
	window.$scope = $scope;
	$scope.stage = 'start';
	$scope.dropZone = document.getElementById('dropZone');
	$scope.tab = 'metadata';

	$scope.waveform = null;
	$scope.lineEditor = null;

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

	$scope.registerLineTimingListeners = function () {
		document.addEventListener('keydown', $scope.lineTimingListeners.keydown);
	};

	$scope.unRegisterLineTimingListeners = function () {
		document.removeEventListener('keydown', $scope.lineTimingListeners.keydown);
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
			$scope.wordTimings[lyricIndex][i] = markerLength / wordCount;
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