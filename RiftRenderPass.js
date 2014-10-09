'use strict';
(function() {
	function RiftRenderPass(args, ctx, goo) {
		this.goo = goo;
		this.ctx = ctx;
		
		this.camera = new goo.Camera();
		this.fullscreenCamera = goo.FullscreenUtil.camera;
		this.renderToScreen = false;
		this.clear = true;
		this.enabled = true;
		this.needsSwap = true;
		this.eyeOffset = 0.4;
		this.fov = 100;
		this.width = null;
		this.height = null;
		this._dc = 1.8; // Distortion compensation scale

		
		// Create composit
		this.material = new goo.Material('Composit material', riftShader);
		
		// Create eye targets
		this.updateSize({ width: ctx.viewportWidth, height: ctx.viewportHeight});
		this.offsetVector = new goo.Vector3();

		
		this.renderable = {
			meshData: goo.FullscreenUtil.quad,
			materials: [this.material]
		};

		// get the renderlist
		this.renderList = ctx.world.getSystem('RenderSystem').renderList;
		this.setup(args, ctx, goo);
	}
	
	RiftRenderPass.prototype.setup = function(args) {
		this.boost = args.boost3D || 1;
	};
	RiftRenderPass.prototype.destroy = function (renderer) {
		this.leftTarget.destroy(renderer.context);
		this.rightTarget.destroy(renderer.context);
		this.leftTarget = null;
		this.rightTarget = null;
	}

	RiftRenderPass.prototype.updateConfig = function (config) {
		var uniforms = this.material.uniforms;
		uniforms.distortion = config.distortionK;
		uniforms.aberration = config.chromAbParameter;
		uniforms.lensCenterOffset = [
			config.lensSeparationDistance / config.hScreenSize - 0.5,
			0
		];
		this.fov = config.FOV;
		this.eyeOffset = config.interpupillaryDistance * this.boost;


		var r = -1.0 - (4 * (config.hScreenSize/4 - config.lensSeparationDistance/2) / config.hScreenSize);
		var distScale = (config.distortionK[0] +
			config.distortionK[1] * Math.pow(r,2) +
			config.distortionK[2] * Math.pow(r,4) +
			config.distortionK[3] * Math.pow(r,6));
		uniforms.scale = [
			1 / distScale,
			1 / distScale
		];
		this.updateSize({ width: config.hResolution, height: config.vResolution })
	}
	


	RiftRenderPass.prototype.updateSize = function(size, renderer) {
		this.material.uniforms.scaleIn = [
			size.width * 0.5 / size.height,
			1
		];
		if (this.width === size.width && this.height === size.height) { return; }
		this.width = size.width;
		this.height = size.height;
		if (this.leftTarget) {
			this.leftTarget.destroy()
			this.rightTarget.destroy()
		}
		// size = { width: 2048, height: 2048 };
		this.leftTarget = new this.goo.RenderTarget(size.width * 0.5 * this._dc, size.height * this._dc);
		this.rightTarget = new this.goo.RenderTarget(size.width * 0.5 * this._dc, size.height * this._dc);
	};

	RiftRenderPass.prototype.render = function (
		renderer,
		writeBuffer,
		readBuffer,
		delta,
		maskActive,
		camera,
		lights,
		clearColor
	) {
		camera = camera || this.goo.Renderer.mainCamera;
		if (!camera) { return; }
		this.camera.copy(camera);
		this.camera.setFrustumPerspective(this.fov, 1);
		lights = lights || [];
		var renderList = this.renderList;
		
		// Left eye
		this.offsetVector.setv(this.camera._left).scale(this.eyeOffset);
		this.camera.translation.addv(this.offsetVector);
		this.camera.update();
		renderer.render(renderList, this.camera, lights, this.leftTarget, this.clear);
		
		// Right eye
		this.offsetVector.scale(2);
		this.camera.translation.subv(this.offsetVector);
		this.camera.update();
		renderer.render(renderList, this.camera, lights, this.rightTarget, this.clear);
		
		// Composit
		this.material.setTexture('LEFT_TEX', this.leftTarget);
		this.material.setTexture('RIGHT_TEX', this.rightTarget);
		if (this.renderToScreen) {
			renderer.render(this.renderable, this.fullscreenCamera, [], null, this.clear);
		} else {
			renderer.render(this.renderable, this.fullscreenCamera, [], writeBuffer, this.clear);
		}
	};
	
	RiftRenderPass.parameters = [{
		key: 'eyeDistance',
		type: 'float',
		min: 0.0,
		max: 0.4,
		'default': 0.1,
		control: 'slider'
	}]	
	var riftShader = {
		attributes : {
			vertexPosition : 'POSITION',
			vertexUV0 : 'TEXCOORD0'
		},
		uniforms : {
			viewMatrix: 'VIEW_MATRIX',
			projectionMatrix: 'PROJECTION_MATRIX',
			worldMatrix: 'WORLD_MATRIX',
			leftTex: 'LEFT_TEX',
			rightTex: 'RIGHT_TEX',
			lensCenterOffset: [0, 0],
			distortion: [1, 0.22, 0.24, 0],
			aberration: [0.996, -0.004, 1.014, 0],
			scaleIn: [1,1],
			scale: [0.8,0.8]
		},
		vshader: [
			'attribute vec3 vertexPosition;',
			'attribute vec2 vertexUV0;',

			'uniform mat4 viewMatrix;',
			'uniform mat4 projectionMatrix;',
			'uniform mat4 worldMatrix;',

			'varying vec2 vUv;',
			'void main() {',
				'vUv = vertexUV0;',
				'gl_Position = projectionMatrix * viewMatrix * worldMatrix * vec4( vertexPosition, 1.0 );',
			'}'
		].join('\n'),
		fshader: [
			'uniform sampler2D leftTex;',
			'uniform sampler2D rightTex;',

			'uniform vec2 scaleIn;',
			'uniform vec2 scale;',
			'uniform vec2 lensCenterOffset;',
			'uniform vec4 distortion;',
			'uniform vec4 aberration;',
			
			'varying vec2 vUv;',

			'vec2 distort(vec2 texCoords, vec2 ab) {',
				// 'vec2 lensOffset = vUv.x > 0.5 ? lensCenterOffset: -lensCenterOffset;',
				'vec2 lensCoords = ((texCoords * 2.0 - 1.0) - lensCenterOffset) * scaleIn;',

				'float rSq = dot(lensCoords, lensCoords);',
				'vec4 r = vec4(1.0, rSq, rSq*rSq, rSq*rSq*rSq);',

				'vec2 newCoords = lensCoords * dot(ab, r.xy) * dot(distortion, r);',
				'return ((newCoords * scale + lensCenterOffset) + 1.0) / 2.0;',
			'}',

			'void main() {',
				'vec2 coord = vUv;',
				'if (vUv.x > 0.5) {', // Right eye
					'coord.x = 1.0 - coord.x;',
				'}',
				'coord.x *= 2.0;',

				'vec2 blue = distort(coord, aberration.zw);',
				'if (!all(equal(clamp(blue, vec2(0.0), vec2(1.0)), blue))) {',
					'discard;',
				'}',

				'vec2 red = distort(coord, aberration.xy);',
				'vec2 green = distort(coord, vec2(1.0, 0.0));',
				'gl_FragColor.a = 1.0;',
				'if (vUv.x > 0.5) {',
					'red.x = 1.0 - red.x;',
					'green.x = 1.0 - green.x;',
					'blue.x = 1.0 - blue.x;',

					'gl_FragColor.r = texture2D(rightTex, red).r;',
					'gl_FragColor.g = texture2D(rightTex, green).g;',
					'gl_FragColor.b = texture2D(rightTex, blue).b;',
				'} else {',
					'gl_FragColor.r = texture2D(leftTex, red).r;',
					'gl_FragColor.g = texture2D(leftTex, green).g;',
					'gl_FragColor.b = texture2D(leftTex, blue).b;',
				'}',
			'}'
		].join('\n')
	};

	window.RiftRenderPass = RiftRenderPass;
}());