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
		this.eyeOffset = 10;
		this.aspect = 1;

		// Create eye targets
		var size = 1024;
		this.leftTarget = new this.goo.RenderTarget(size, size);
		this.rightTarget = new this.goo.RenderTarget(size, size);
		this.offsetVector = new goo.Vector3();
		
		// Create composit
		this.material = new goo.Material('Composit material', riftShader);
		
		
		this.renderable = {
			meshData: goo.FullscreenUtil.quad,
			materials: [this.material]
		};

		// get the renderlist
		this.renderList = ctx.world.getSystem('RenderSystem').renderList;
		this.setup(args, ctx, goo);
	}
	
	RiftRenderPass.prototype.setup = function(args) {
		var screenWidth = 8 //cm;
		var lensDistance = 4 // cm
		var lensCenterOffset = lensDistance / screenWidth - 0.5 // screen units (full width is 1);
		this.material.uniforms.lensCenterOffset = [lensCenterOffset, 0];
		this.material.uniforms.aspect = 1;
		this.material.uniforms.scale = args.scale;
		this.material.uniforms.scaleIn = args.scaleIn
		this.eyeOffset = lensDistance / 200 || 0.0;
		this.boost = args.boost || 1;
	};
	RiftRenderPass.prototype.destroy = function (renderer) {
		this.leftTarget.destroy(renderer.context);
		this.rightTarget.destroy(renderer.context);
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
	}
	


	RiftRenderPass.prototype.updateSize = function(size, renderer) {
		this.material.uniforms.aspect = size.width * 0.5 / size.height;
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
			aspect: 1,
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
			'uniform float aspect;',
			
			'varying vec2 vUv;',

			'vec2 distort(vec2 texCoords, vec2 lensOffset) {',
				'vec2 lensCoords = ((texCoords * 2.0 - 1.0) - lensOffset) * scaleIn;',
				'lensCoords.x *= aspect;',

				'float rSq = dot(lensCoords, lensCoords);',
				'vec4 r = vec4(1.0, rSq, rSq*rSq, rSq*rSq*rSq);',

				'vec2 newCoords = lensCoords * dot(distortion, r);',
				'return ((newCoords * scale + lensOffset) + 1.0) / 2.0;',
			'}',


			'void main(){',
				'vec2 coords = vUv;',
				'vec2 lensOffset = -lensCenterOffset;',
				'coords.x *= 2.0;',
				'if (vUv.x >= 0.5) {', // Right eye
					'coords.x -= 1.0;',
					'lensOffset = -lensOffset;',
				'}',
				'vec2 distortedCoords = distort(coords, lensOffset);',
				'vec2 clamped = clamp(distortedCoords, vec2(0.0), vec2(1.0));',
				'if (!all(equal(clamped, distortedCoords))) {',
					'gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0); return;',
					'discard;',
				'} else {',
					'if (vUv.x >= 0.5) {', // Right eye
						'gl_FragColor = texture2D(rightTex, distortedCoords);',
					'} else {',
						'gl_FragColor = texture2D(leftTex, distortedCoords);',
					'}',
				'}',
			'}'
		].join('\n')
	};

	window.RiftRenderPass = RiftRenderPass;
}());