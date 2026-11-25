import * as THREE from './node_modules/three/build/three.module.js';
import { teaColors } from './tea-colors.js?v=servings';

const cupBase=.011;
const glassScale=1.25;
const profile=[[.034,0],[.041,.003],[.047,.008],[.052,.020],[.060,.043],[.063,.061],[.061,.077],[.056,.094],[.050,.111],[.048,.126],[.051,.145],[.058,.167],[.066,.191],[.068,.202]];
const [lipRadius,glassHeight]=profile.at(-1);
const rimRadius=lipRadius*glassScale,depth=cupBase+glassHeight*glassScale;
const lathe=points=>new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),72);

export function renderTeaLight(renderer){
  const w=128,h=64,pixels=new Float32Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const u=x/w,v=y/h,i=4*(y*w+x);
    const window=2.5*Math.exp(-(((u-.22)/.054)**4+((v-.68)/.20)**4));
    const strip=1.8*Math.exp(-(((u-.665)/.013)**2+((v-.61)/.18)**4));
    const light=.13+.34*v+window+strip;
    pixels.set([light,light*.96,light*.90,1],i);
  }
  const panorama=new THREE.DataTexture(pixels,w,h,THREE.RGBAFormat,THREE.FloatType);
  panorama.mapping=THREE.EquirectangularReflectionMapping;panorama.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),map=pmrem.fromEquirectangular(panorama);
  pmrem.dispose();panorama.dispose();return map;
}
function reflections(renderer,faces){
  if(!faces)return renderTeaLight(renderer).texture;
  // This Three.js texture accepts a full mip chain per face, including raw RGBA.
  const map=new THREE.CompressedCubeTexture(faces,THREE.RGBAFormat,THREE.HalfFloatType);
  map.colorSpace=THREE.LinearSRGBColorSpace;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.isPMREMTexture=true;map.needsUpdate=true;return map;
}
function mesh(geometry,material,name){
  const m=new THREE.Mesh(geometry,material);m.name=name;m.receiveShadow=true;return m;
}
export function createTeaService(renderer,art,light){
  const envMap=reflections(renderer,light),form=new THREE.Group();
  const porcelainMap=new THREE.CanvasTexture(art);porcelainMap.colorSpace=THREE.SRGBColorSpace;porcelainMap.anisotropy=4;
  const porcelain=new THREE.MeshStandardMaterial({map:porcelainMap,color:0xe4ded4,roughness:.37,envMap,envMapIntensity:.25,side:THREE.DoubleSide});
  const saucerProfile=[[0,.003],[.065,.002],[.10,.004],[.128,.009],[.150,.017],[.160,.022],[.158,.026],[.15,.027],[.126,.02],[.10,.012],[.072,.010],[0,.011]];
  const geo=lathe(saucerProfile),positions=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<positions.count;i++)uv.setXY(i,.5+positions.getX(i)/.327,.5-positions.getZ(i)/.327);
  const dish=mesh(geo,porcelain,'saucer');dish.castShadow=true;form.add(dish);
  const vessel=new THREE.Group();vessel.name='tea glass assembly';
  vessel.position.y=cupBase;vessel.scale.setScalar(glassScale);form.add(vessel);
  const glass=new THREE.MeshPhysicalMaterial({color:0xfffefa,roughness:.035,transmission:1,thickness:.005,ior:1.49,envMap,envMapIntensity:.85});
  // The filled volume already refracts the scene. Add only the outer glass
  // reflections over it so two screen-space refractions cannot hide each other.
  const filledWalls=new THREE.MeshPhysicalMaterial({color:0x000000,roughness:.045,ior:1.49,
    envMap,envMapIntensity:.85,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const walls=[[0,0],...profile,...profile.slice().reverse().map(([r,y])=>[r-.002,Math.max(.010,y)]),[0,.011]];
  const cup=mesh(lathe(walls),glass,'glass');vessel.add(cup);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.0674,.0015,10,72),new THREE.MeshStandardMaterial({
    color:0xc0bab1,roughness:.1,metalness:.70,envMap,transparent:true,opacity:.62,depthWrite:false}));
  rim.name='glass lip';rim.rotation.x=Math.PI/2;rim.position.y=glassHeight;rim.renderOrder=3;vessel.add(rim);
  const foot=rim.clone();foot.name='glass foot';foot.scale.set(.62,.62,1.4);foot.position.y=.004;vessel.add(foot);
  const silver=new THREE.MeshStandardMaterial({color:0xd4ccc0,metalness:.95,roughness:.21,envMap,envMapIntensity:.65,side:THREE.DoubleSide});
  const spoon=new THREE.Group();spoon.rotation.y=-.48;spoon.position.set(.094,.016,.004);
  const bowl=mesh(lathe([[0,.001],[.014,.003],[.022,.007],[.022,.008],[.014,.004],[0,.002]]),silver,'spoon bowl');
  bowl.scale.set(.83,1,1.45);bowl.position.z=-.055;spoon.add(bowl);
  const handle=mesh(new THREE.CapsuleGeometry(.0044,.106,4,12),silver,'spoon handle');
  handle.rotation.x=Math.PI*.46;handle.position.set(0,.010,.023);spoon.add(handle);form.add(spoon);
  const liquidCache=new Map();
  function forFill(dem=0,water=0){
    if(!dem&&!water)return form;
    const key=dem+'-'+water;
    if(liquidCache.has(key))return liquidCache.get(key);
    const total=dem+water,fraction=dem/total,level=.013+Math.min(total/10,1)*.179;
    const next=profile.findIndex(([,y])=>y>=level),[r0,y0]=profile[next-1],[r1,y1]=profile[next];
    const edge=r0+(r1-r0)*(level-y0)/(y1-y0)-.003;
    const fill=[[0,.011],...profile.filter(([,y])=>y>.011&&y<level).map(([r,y])=>[r-.003,y]),[edge,level],[edge-.0015,level+.0006],[0,level]];
    const liquid=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.065,envMap,envMapIntensity:.40,
      transmission:1,thickness:.07,ior:1.33});
    if(dem){
      const palette=teaColors(fraction);
      liquid.attenuationColor.set(palette.amber);
      liquid.attenuationDistance=.083*glassScale;
      liquid.onBeforeCompile=shader=>{
        shader.uniforms.teaScatter={value:new THREE.Color(palette.deep)};
        shader.uniforms.fillLevel={value:level};
        shader.uniforms.fillRadius={value:edge};
        shader.vertexShader='varying vec3 vTeaPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\nvTeaPoint=position;');
        shader.fragmentShader='varying vec3 vTeaPoint; uniform vec3 teaScatter; uniform float fillLevel, fillRadius;\n'+shader.fragmentShader;
        // Estimate the chord a ray travels through the tulip-shaped volume.
        // Three's Beer–Lambert attenuation then filters the actual saucer and wood.
        const transmission=THREE.ShaderChunk.transmission_fragment.replace('material.thickness = thickness;',`
          float radius=length(vTeaPoint.xz);
          float facing=abs(dot(normalize(vViewPosition),normal));
          float sidePath=2.0*radius*max(.11,facing);
          float toBase=max(.006,vTeaPoint.y-.009)/max(.30,normalize(cameraPosition-vWorldPosition).y);
          float radial=clamp(radius/fillRadius,0.0,1.0);
          float surfacePath=(.040+.12*sqrt(1.0-radial*radial));
          float top=smoothstep(fillLevel-.0015,fillLevel-.0002,vTeaPoint.y);
          material.thickness=max(.006,min(toBase,mix(sidePath,surfacePath,top)));
        `);
        shader.fragmentShader=shader.fragmentShader.replace('#include <transmission_fragment>',transmission)
          .replace('#include <opaque_fragment>','outgoingLight+=teaScatter*.14;\n#include <opaque_fragment>');
      };
      // Each fill has its own optical uniforms even when its shader program is shared.
      liquid.customProgramCacheKey=()=>'brewed-tea';
    }
    const m=mesh(lathe(fill),liquid,'tea');
    const group=form.clone(),sides=group.getObjectByName('glass');
    sides.material=filledWalls;sides.renderOrder=2;
    group.getObjectByName(vessel.name).add(m);liquidCache.set(key,group);return group;
  }
  return {group:form,forFill,width:.32,height:.32,depth,rimRadius,
    topY(u,v){const r=Math.hypot(u-.5,v-.5)*.32;return r<rimRadius?depth:.024;},
    mask:{alpha(u,v){return Math.hypot(u-.5,v-.5)<.50?1:0;}},
    perimeter:Array.from({length:40},(_,i)=>[.16*Math.cos(i*Math.PI/20),.16*Math.sin(i*Math.PI/20)]),
    contacts:[[0,0],[-.06,0],[.06,0],[0,.06],[0,-.06]]};
}
