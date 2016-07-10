var audioCtx = new window.AudioContext();
var wavelyricApp = angular.module('wavelyricApp', []);

wavelyricApp.controller('WavelyricCtrl', function ($scope) {
	window.$scope = $scope;
	$scope.stage = 'start';
	$scope.dropZone = document.getElementById('dropZone');
	$scope.tab = 'metadata';

	$scope.waveform = null;
	$scope.activeEditor = null;

	$scope.metadata = {
		language: 'EN',
		difficulty: '1'
	};

	$scope.lines = [];
	$scope.markers = [];
	$scope.currentMarker = null;
	$scope.spaces = 0;

	registerEventListeners($scope.dropZone, $scope);

	$scope.$watch('tab', function (newTab, oldTab) {
		if (newTab === 'lineTiming') {
			$scope.activeEditor = new MarkerEditor(document.getElementById('lineTimingCanvas'), audioCtx, $scope.waveform, 0, $scope.waveform.length);
			$scope.activeEditor.onChangeCurrentMarker = $scope.onChangeCurrentMarker;
			$scope.activeEditor.markers = $scope.markers;
			$scope.activeEditor.textHeight = 18;
			$scope.registerLineTimingListeners();
		} else if (oldTab === 'lineTiming') {
			$scope.activeEditor.destroy();
			delete $scope.activeEditor;
			$scope.unRegisterLineTimingListeners();
			$scope.activeEditor = null;
		}
	});

	$scope.lineTimingListeners = {
		keydown: function (e) {
			if (e.keyCode === 32) {	// space
				if ($scope.activeEditor.playing)
					$scope.activeEditor.stop();
				else
					$scope.activeEditor.play();

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
			if ($scope.markers[i].position > $scope.activeEditor.cursor) {
				placeMarker = i;
				break;
			}
		}

		if (placeMarker !== -1) {
			if ($scope.activeEditor.cursor >
				$scope.activeEditor.startTime + $scope.activeEditor.length
				- $scope.activeEditor.minimumMarkerDistance * ($scope.markers.length - placeMarker)) {
				return;
			}

			var position = $scope.activeEditor.cursor;
			if (placeMarker !== 0) {
				if (position - $scope.markers[placeMarker - 1].position < $scope.activeEditor.minimumMarkerDistance) {
					position = $scope.markers[placeMarker - 1].position + $scope.activeEditor.minimumMarkerDistance;
					// no need to do the greaterIterator stuff, because that position should never be able to happen in the first place
				}
			}
			$scope.markers[placeMarker].position = position;
		} else {
			if ($scope.markers.length - $scope.spaces === $scope.lines.length) {
				return;
			}

			var position = $scope.activeEditor.cursor;
			if ($scope.markers.length !== 0) {
				if (position - $scope.markers[$scope.markers.length - 1].position < $scope.activeEditor.minimumMarkerDistance) {
					position = $scope.markers[$scope.markers.length - 1].position + $scope.activeEditor.minimumMarkerDistance;
				}
				if (position > $scope.activeEditor.startTime + $scope.activeEditor.length) {
					return;
				}
			}
			$scope.markers.push({
				text: $scope.lines[$scope.markers.length - $scope.spaces],
				position: position
			});
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
			if ($scope.markers[i].position > $scope.activeEditor.cursor) {
				afterCursor = i;
				break;
			}
		}

		var position = $scope.activeEditor.cursor;
		if ($scope.currentMarker !== null && position - $scope.markers[$scope.currentMarker].position < $scope.activeEditor.minimumMarkerDistance) {
			position = $scope.markers[$scope.currentMarker].position + $scope.activeEditor.minimumMarkerDistance;
		}

		if (afterCursor !== -1) {
			if ($scope.markers[afterCursor].position - $scope.activeEditor.cursor < $scope.activeEditor.minimumMarkerDistance)
				return;

			if ($scope.markers[afterCursor].space) {
				$scope.markers.splice(afterCursor, 1);
				$scope.spaces--;
			}

			if ($scope.markers.length > afterCursor && afterCursor > 0 && $scope.markers[afterCursor].position - $scope.markers[afterCursor - 1].position < $scope.activeEditor.minimumMarkerDistance * 2)
				return;

			$scope.markers.splice(afterCursor, 0, {
				text: '<space>',
				position: position,
				space: true
			});
			$scope.spaces++;
		} else {
			$scope.markers.push({
				text: '<space>',
				position: position,
				space: true
			});
			$scope.spaces++;
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
		});
		$scope.stage = 'main';
	};

	$scope.onChangeCurrentMarker = function (newMarker, oldMarker) {
		$scope.currentMarker = newMarker;
		$scope.$apply();
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