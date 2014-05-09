'use strict';
(function() {
	function GoggleRenderPass(args, ctx, goo) {
		this.goo = goo;
		this.ctx = ctx;
		
		this.camera = new goo.Camera();
		this.fullscreenCamera = goo.FullscreenUtil.camera;
		this.renderToScreen = false;
		this.clear = true;
		this.enabled = true;
		this.needsSwap = true;

		// Create eye targets
		this.updateSize(ctx.viewportWidth, ctx.viewportHeight);
		this.offsetVector = new goo.Vector3();
		
		// Create composit
		this.material = new goo.Material('Composit material', compositShader);
		
		
		this.renderable = {
			meshData: goo.FullscreenUtil.quad,
			materials: [this.material]
		};

		// get the renderlist
		this.renderList = ctx.world.getSystem('RenderSystem').renderList;
		this.setup(args, ctx, goo);
	}
	
	GoggleRenderPass.prototype.setup = function(args, ctx, goo) {
		this.eyeOffset = args.eyeDistance / 2 || 0.0;
		this.material.uniforms.screenOffset = args.screenDistance / 2 || 0.0;
		this.material.uniforms.leftColor = args.leftColor || [1, 1, 0];
		this.material.uniforms.rightColor = args.rightColor || [0, 0, 1];


		var renderSystem = ctx.world.getSystem('RenderSystem');
		var composer;
		// Get or create composer
		if (renderSystem.composers.length) {
			composer = renderSystem.composers[0];
			ctx.renderPass = composer.passes.shift();
			this.renderToScreen = false;
		} else {
			composer = ctx.composer = new goo.Composer();
			renderSystem.composers.push(ctx.composer);
			this.renderToScreen = true;
		}
		// Add the post effect
		composer.passes.unshift(this);
		if (composer.size) {
			this.updateSize(composer.size);
			this.viewportSize = composer.size;
		}
	};
	
	GoggleRenderPass.prototype.cleanup = function(args, ctx, goo) {
		// Make sure to cleanup everything we do, so nothing lingers in the engine
		var renderSystem = ctx.world.getSystem('RenderSystem');
		if (ctx.composer) {
			// If we created a post effect chain, remove it
			goo.ArrayUtil.remove(renderSystem.composers, ctx.composer);
		} else {
			// Otherwise, remove the post effect and put back the outpass
			var composer = renderSystem.composers[0];
			goo.ArrayUtil.remove(composer.passes, this);
			composer.passes.unshift(ctx.renderPass);
		}
	};

	GoggleRenderPass.prototype.updateSize = function(size) {
		this.leftTarget = new this.goo.RenderTarget(size.width, size.height);
		this.rightTarget = new this.goo.RenderTarget(size.width, size.height);
	};

	GoggleRenderPass.prototype.render = function (
		renderer,
		writeBuffer,
		readBuffer,
		delta,
		maskActive,
		camera,
		lights,
		clearColor
	) {
		camera = camera || goo.Renderer.mainCamera;
		if (!camera) { return; }
		this.camera.copy(camera);
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
	
	GoggleRenderPass.parameters = [{
		key: 'eyeDistance',
		type: 'float',
		min: 0.0,
		max: 0.4,
		'default': 0.1,
		control: 'slider'
	}, {
		key: 'screenDistance',
		type: 'float',
		min: 0.0,
		max: 100.0,
		'default': 15,
		control: 'slider'
	}, {
		key: 'leftColor',
		type: 'vec3',
		control: 'color',
		'default': [1, 1, 0]
	}, {
		key: 'rightColor',
		type: 'vec3',
		control: 'color',
		'default': [0, 0, 1]
	}];
	
	var compositShader = {
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
			resolution: 'RESOLUTION',

			leftColor: [1, 0, 0],
			rightColor: [0, 1, 0],
			screenOffset: 0.0
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

			'uniform vec3 leftColor;',
			'uniform vec3 rightColor;',
			'uniform float screenOffset;',
			'uniform vec2 resolution;',
			
			'varying vec2 vUv;',
			'void main(void) {',
				// Left eye
				'vec2 coord = vUv;',
				'coord.x += screenOffset / resolution.x;',
				'gl_FragColor = texture2D(leftTex, coord) * vec4(leftColor, 1.0);',
				// Right eye
				'coord.x -= screenOffset * 2.0 / resolution.x;',
				'gl_FragColor += texture2D(rightTex, coord) * vec4(rightColor, 1.0);',
			'}'
		].join('\n')
	};

	var global = global || window;
	global.GoggleRenderPass = GoggleRenderPass;
}());