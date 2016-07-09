var audioCtx = new window.AudioContext();
var waveform;

var dropZone = document.body;
dropZone.ondragover = function (e) {
	e.stopPropagation();
	e.preventDefault();
	
	e.dataTransfer.dropEffect = 'copy';
};

dropZone.ondragenter = function (e) {
	document.body.style.backgroundColor='#dfd';
};

dropZone.ondragleave = function (e) {
	document.body.style.backgroundColor='white';
};

dropZone.ondrop = function (e) {
	e.stopPropagation();
	e.preventDefault();

	document.body.style.backgroundColor='white';

	var files = e.dataTransfer.files;
	if (files.length > 0) {
		var file = files[0];
		
		if (!(file.type.length > 6 && file.type.substring(0, 6) === 'audio/')) {
			return;
		}

		var reader = new FileReader();
		reader.onload = function (e) {
			audioCtx.decodeAudioData(e.target.result).then(function (audioBuffer) {
				let waveform = new Waveform(audioBuffer, 1000);
				editor = new MarkerEditor(document.getElementById('waveCanvas'), waveform, 0, waveform.length);

				document.onkeydown = e => {
					if (e.keyCode === 32) {
						if (editor.playing) {
							editor.stop();
						} else {
							editor.play();
						}
					}
				};
			});
		};

		reader.readAsArrayBuffer(file);
	}
};