/**
 * A Web Midi Wrapper to send data in a more human readable format
 *
 * Available channel events are:
 * - noteOn
 * - noteOff
 * - controllerChange
 * - programChange
 * - pitchBend
 * - some others
 *
 * MidiEval.init(
 *   function success() {
 *     var channel = MidiEval.getChannel(1);
 *     if (channel) {
 *       channel.on('noteOn', function(evt) {
 *         someItem.value = evt.data.value;
 *       });
 *     }
 *   },
 *   function error(data) {
 *     console.error(data.message);
 *   }
 * );
 */

'use strict';
(function(global) {
	var MidiAccess = null;
	var channels = [];

	var MidiEval = {
		init: function(onSuccess, onError) {
			// Only init once
			if (MidiAccess) {
				onSuccess();
				return
			}

			global.navigator.requestMIDIAccess().then(function (access) {
				MidiAccess = access;
				// Create channels (event targets really)
				for (var i = 0; i < 16; i++) {
					channels.push(new Channel());
				}
				// Add midi-input listeners
				addListeners();
				// And we're done
				onSuccess();
			}, function (error) {
				onError(error);
			});
		},
		destroy: function() {
			if (MidiAccess) {
				removeListeners();
				channels = [];
				MidiAccess = null;
			}
		},
		// Midi channels are 1 - 16
		getChannel: function(idx) {
			return channels[idx - 1];
		},
		parseNote: function(noteIdx) {
			return {
				octave: Math.floor(noteIdx / 12),
				note: noteMap[(noteIdx % 12 + 12) % 12],
				frequency: 440 * Math.exp((noteIdx - 9) / 12 * Math.LN2),
			};
		}
	};
	global.MidiEval = MidiEval;


	function onMidi(message) {
		var data = getData(message.data);
		if (data.type === 'error') {
			console.error('Error', data.message);
			return;
		}

		var channel = channels[data.channel];
		if (channel) {
			channel._emit(data);
		}
	}

	function addListeners() {
		// Due to some chrome bug, we need to wait a while to add the listeners
		setTimeout(function() {
			var inputs = MidiAccess.inputs.values();
			var input = inputs.next();
			while(input.value) {
				input.value.open();
				input.value.addEventListener('midimessage', onMidi);
				input = inputs.next();
			}
		}, 50);
	}
	function removeListeners() {
		var inputs = MidiAccess.inputs.values();
		var input = inputs.next();
		while(input.value) {
			input.removeEventListener('midimessage', onMidi);
			input = inputs.next();
		}
	}

	// Doing some Uint8 parsing to get human readable data
	function getData (bytes) {
		if (bytes[0] & 1 << 7 === 0) {
			return {
				type: 'error',
				message: 'First byte is not status'
			};
		}

		var channel = bytes[0] & 15;

		var idx = (bytes[0] >> 4) & 7
		var type = typeMap[idx];

		var data = {};
		switch (type) {
			// Note events
			case 'noteOff':
			case 'noteOn':
			case 'afterTouch':
				data.note = bytes[1] - 60;
				data.value = bytes[2];
				break;
			// Controller events
			case 'controllerChange':
				data.controllerIndex = bytes[1];
				data.value = bytes[2];
				var name = controllerMap[bytes[1]];
				if (name) {
					data.controllerName = name;
				}
				break;
			// Channel wide events
			case 'programChange':
				data.program = bytes[1];
				break;
			case 'channelPressure':
				data.value = bytes[1];
				break;
			case 'pitchBend':
				data.value = bytes[1] * 128 + bytes[2];
		}
		return {
			channel: channel,
			type: type,
			data: data
		};
	}
	
	function setData(data, channelIdx) {
		// Status byte
		var stat = 1 << 7;
		stat |= channelIdx

		// Type of MIDI call
		var typeMask = typeMap.indexOf(data.type) << 4;
		stat |= typeMask;
		
		var bytes = [stat];
		switch (data.type) {
			case 'noteOff':
			case 'noteOn':
			case 'afterTouch':
				if (typeof(data.note) === 'number') {
					var note = data.note + 60;
				} else {
					var m = data.note.match(/([A-G](#|b)?)(-?\d*)/);
					if (m && !isNaN(m[3])) {
						var note = noteMap.indexOf(m[1]) + m[3] * 12 + 60;
					} else {
						var note = 0;
					}
				}
				bytes.push(note, data.value);
				break;
			case 'controllerChange':
				bytes.push(data.controllerIdx, data.value);
				break;
			case 'programChange':
				bytes.push(data.program);
				break;
			case 'channelPressure':
				bytes.push(data.value);
			case 'pitchBend':
				var firstVal = data.value >> 7;
				var secondVal = data.value & 127;
				bytes.push(firstVal, secondVal);
		}
		return bytes;
	}

	// Some of the events taken from the MIDI spec. Should probably add some more
	var typeMap = [
		'noteOff',
		'noteOn',
		'afterTouch',
		'controllerChange',
		'programChange',
		'channelPressure',
		'pitchBend'
	];

	// Some of the standard controllers taken from the MIDI spec.
	var controllerMap = {
		1: 'Modulation',
		7: 'Volume',
		10: 'Pan',
		11: 'Expression',
		64: 'Sustain'	
	};

	var noteMap = [
		'C',
		'C#',
		'D',
		'Eb',
		'E',
		'F',
		'F#',
		'G',
		'Ab',
		'A',
		'Bb',
		'B'
	];

	/**
	 * A channel class, really just a simple event target implementation
	 */
	function Channel() {
		this._listeners = {};
	}
	Channel.prototype.on = function (key, callback) {
		this._listeners[key] = this._listeners[key] || [];
		this._listeners[key].push(callback);
	};
	Channel.prototype.off = function (key, callback) {
		if (callback && this._listeners[key]) {
			var idx = this._listeners[key].indexOf(callback);
			if (idx > -1) {
				this._listeners[key].splice(idx, 1);
			}
		} else {
			delete this._listeners[key];
		}
	};
	Channel.prototype.send = function (data, delay) {
		if (!MidiAccess) { return; }
		var timeStamp = (delay || 0) + performance.now();
		var bytes = setData(data, channels.indexOf(this));
		var outputs = MidiAccess.outputs.values();
		var output = outputs.next();
		while (output.value) {
			output.send(bytes, timeStamp);
			output = outputs.next();
		}
	};
	Channel.prototype._emit = function (data) {
		var key = data.type;
		var listeners = this._listeners[key];
		if (listeners) {
			for (var i = 0; i < listeners.length; i++) {
				listeners[i](data);
			}
		}
	};

}(window));