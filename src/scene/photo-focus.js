import * as THREE from '../../node_modules/three/build/three.module.js';

// A thin-lens circle of confusion softens distant wood in an oblique photo.
// Reject closer samples behind an edge to preserve the silhouette of the food.
export function createPhotoFocus(renderer){
  function makeTarget(){
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    return target;
  }
  const preview=makeTarget();
  const size=new THREE.Vector2();
  const uniforms={
    colorMap:{value:preview.texture},depthMap:{value:preview.depthTexture},
    texel:{value:new THREE.Vector2()},focus:{value:1},gate:{value:1},near:{value:.02},far:{value:30},aperture:{value:0}
  };
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D colorMap,depthMap;
      uniform vec2 texel;
      uniform float focus,gate,near,far,aperture;
      float distanceAt(vec2 uv){
        float z=texture2D(depthMap,uv).r;
        return near*far/(far-z*(far-near));
      }
      void main(){
        float z=distanceAt(vUv);
        float radius=gate*aperture*max(0.,abs(z-focus)-.12)/z;
        radius=clamp(radius,0.,gate*.011);
        vec3 color=texture2D(colorMap,vUv).rgb;
        if(radius>.5){
          float weights=1.;
          for(int i=0;i<16;i++){
            float n=float(i)+.5, angle=2.399963*n;
            vec2 uv=vUv+texel*radius*sqrt(n/16.)*vec2(cos(angle),sin(angle));
            float w=smoothstep(-.05,.0,distanceAt(uv)-z);
            color+=texture2D(colorMap,uv).rgb*w;weights+=w;
          }
          color/=weights;
        }
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`
  }));
  const screen=new THREE.Scene(),lens=new THREE.Camera();screen.add(quad);
  function present(camera,setup,gate,target=preview){
    uniforms.colorMap.value=target.texture;uniforms.depthMap.value=target.depthTexture;
    uniforms.texel.value.set(1/target.width,1/target.height);
    uniforms.focus.value=setup.distance;uniforms.gate.value=gate;
    uniforms.aperture.value=.015*Math.abs(camera.up.y);
    uniforms.near.value=camera.near;uniforms.far.value=camera.far;
    renderer.setRenderTarget(null);renderer.render(screen,lens);
  }
  function render(scene,camera,setup,gate,target=preview){
    renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);
    renderer.setRenderTarget(target);renderer.render(scene,camera);
    present(camera,setup,gate,target);
  }
  return {render,present,exportFrame(scene,camera,setup,gate){
    // Preserve the full-size preview colour and depth while exposing the square
    // film gate. Restoring the viewfinder then takes a single fullscreen draw.
    const film=makeTarget();
    try{render(scene,camera,setup,gate,film);}
    finally{film.dispose();}
  }};
}
