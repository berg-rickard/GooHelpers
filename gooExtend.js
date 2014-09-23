'use strict';
(function() {
	var extensions = {
		Matrix3x3: {
			fromAnglesYXZ: function (x, y, z) {
				var d = this.data;

				var cy = Math.cos(x);
				var sy = Math.sin(x);
				var ch = Math.cos(y);
				var sh = Math.sin(y);
				var cp = Math.cos(z);
				var sp = Math.sin(z);

				d[0] = ch * cp + sh * sp * sy;
				d[3] = sh * cp * sy - ch * sp;
				d[6] = cy * sh;

				d[1] = cy * sp;
				d[4] = cy * cp;
				d[7] = - sy;

				d[2] = ch * sp * sy - sh * cp;
				d[5] = sh * sp + ch * cp * sy;
				d[8] = cy * ch;
			}
		}
		Vector3: {
			clamp: function(start, end) {
				var td = this.data;
				var sd = start.data;
				var ed = end.data;
				td[0] = Math.max(Math.min(td[0], ed[0]), sd[0]);
				td[1] = Math.max(Math.min(td[1], ed[1]), sd[1]);
				td[2] = Math.max(Math.min(td[2], ed[2]), sd[2]);
			}
		}
	}

	var init = false;
	window.gooExtend = function gooExtend(goo) {
		if (!init) {
			for (var obj in extensions) {
				for (var member in extensions[obj]) {
					if (goo[obj].prototype[member] === undefined)
					goo[obj].prototype[member] = extensions[obj][member];
				}
			}
			init = true;
		}
	}
}());