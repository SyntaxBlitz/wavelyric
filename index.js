var audioCtx = new window.AudioContext();
var wavelyricApp = angular.module('wavelyricApp', []);

wavelyricApp.controller('WavelyricCtrl', function ($scope) {
	$scope.stage = 'start';
	$scope.dropZone = document.getElementById('dropZone');
	$scope.tab = 'metadata';

	$scope.waveform = null;
	$scope.activeEditor = null;

	$scope.metadata = {
		language: 'EN',
		difficulty: '1'
	};

	registerEventListeners($scope.dropZone, $scope);

	$scope.$watch('tab', function (newTab, oldTab) {
		if (newTab === 'lineTiming') {
			$scope.activeEditor = new MarkerEditor(document.getElementById('lineTimingCanvas'), audioCtx, $scope.waveform, 0, $scope.waveform.length);
		} else if (oldTab === 'lineTiming') {
			$scope.activeEditor.destroy();
			delete $scope.activeEditor;
			$scope.activeEditor = null;
		}
	});
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