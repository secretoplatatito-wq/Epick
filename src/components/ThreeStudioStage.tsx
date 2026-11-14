import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { AspectRatioProfile, WorkspaceProject } from '../../backend/types';

interface ThreeStudioStageProps {
  workspace: WorkspaceProject | null;
  accentColor: string;
}

type CameraPreset = 'front' | 'rig' | 'wide';
type LightingPreset = 'broadcast' | 'warm' | 'minimal';

function detectSoftwareWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createFloorGridTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d111a';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0,0,0,0.75)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.32)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

function drawScreenPreviewTexture(
  canvas: HTMLCanvasElement,
  title: string,
  aspectRatio: AspectRatioProfile,
  accent: string,
  clips: Array<{ rank: number; caption: string }>
) {
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0e131e';
  ctx.fillRect(0, 0, 512, 512);

  // Studio header bar
  ctx.fillStyle = '#141926';
  ctx.fillRect(28, 28, 456, 56);
  ctx.fillStyle = accent;
  ctx.fillRect(28, 28, 10, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  const cleanTitle = title.length > 30 ? `${title.slice(0, 29)}...` : title || 'CLIPPAH RANKING STAGE';
  ctx.fillText(cleanTitle, 50, 63);

  // Aspect tag
  ctx.fillStyle = '#1c2232';
  ctx.fillRect(28, 96, 140, 34);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`PROFILE ${aspectRatio}`, 42, 118);

  // Top clips preview list
  const list = clips.length
    ? clips.slice(0, 4)
    : [
        { rank: 4, caption: 'Opening Crowd Reaction' },
        { rank: 3, caption: 'Mid-Clip Plot Twist' },
        { rank: 2, caption: 'Unbelievable Reflex Save' },
        { rank: 1, caption: 'Viral Finale Moment' },
      ];

  list.forEach((item, idx) => {
    const y = 154 + idx * 78;
    ctx.fillStyle = '#182032';
    ctx.fillRect(28, y, 456, 64);
    ctx.fillStyle = accent;
    ctx.fillRect(36, y + 12, 62, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`#${item.rank}`, 48, y + 40);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px sans-serif';
    ctx.fillText(item.caption.slice(0, 30), 114, y + 39);
  });
}

export const ThreeStudioStage: React.FC<ThreeStudioStageProps> = ({ workspace, accentColor }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState<AspectRatioProfile>(workspace?.overlayConfig.aspectRatio || '9:16');
  const [camPreset, setCamPreset] = useState<CameraPreset>('front');
  const [lightPreset, setLightPreset] = useState<LightingPreset>('broadcast');
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const stageStateRef = useRef({
    aspect,
    camPreset,
    lightPreset,
    accentColor,
    title: workspace?.title || 'CLIPPAH 3D Stage',
    clips: workspace?.clips || [],
  });

  const triggerUpdateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stageStateRef.current = {
      aspect,
      camPreset,
      lightPreset,
      accentColor,
      title: workspace?.title || 'CLIPPAH 3D Stage',
      clips: workspace?.clips || [],
    };
    triggerUpdateRef.current?.();
  }, [aspect, camPreset, lightPreset, accentColor, workspace?.title, workspace?.clips]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 1200;
    const height = container.clientHeight || 680;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d12);
    scene.fog = new THREE.FogExp2(0x0b0d12, 0.038);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 2.35, 6.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Three-point warm/cool studio lighting rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(4.5, 6.5, 4.2);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-4.5, 4.0, -4.5);
    scene.add(rimLight);

    // Studio floor with procedural grid CanvasTexture
    const floorTex = createFloorGridTexture();
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      roughness: 0.78,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const shadowTex = createContactShadowTexture();
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    // ---------------------------------------------------------
    // 1. COMPOSITE HERO MODEL A: Broadcast Ranking Monitor Rig (8 parts)
    // ---------------------------------------------------------
    const monitorGroup = new THREE.Group();
    monitorGroup.position.set(0, 0, 0);

    const matteChassisMat = new THREE.MeshStandardMaterial({
      color: 0x1e2433,
      roughness: 0.65,
      metalness: 0.25,
    });
    const brushedMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      roughness: 0.22,
      metalness: 0.92,
      anisotropy: 0.75,
    });
    const accentTrimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(stageStateRef.current.accentColor),
      roughness: 0.3,
      metalness: 0.45,
      emissive: new THREE.Color(stageStateRef.current.accentColor),
      emissiveIntensity: 0.22,
    });

    // Base plinth grounded flush at y = 0
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.12, 0.14, 32), matteChassisMat);
    plinth.position.y = 0.07;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    monitorGroup.add(plinth);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.18, 24), brushedMetalMat);
    collar.position.set(0, 0.22, -0.14);
    monitorGroup.add(collar);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.35, 20), brushedMetalMat);
    mast.position.set(0, 0.9, -0.14);
    mast.castShadow = true;
    monitorGroup.add(mast);

    const rearMountArm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.18), matteChassisMat);
    rearMountArm.position.set(0, 1.48, -0.08);
    monitorGroup.add(rearMountArm);

    // Beveled frame chassis (ExtrudeGeometry)
    const screenCanvas = document.createElement('canvas');
    drawScreenPreviewTexture(
      screenCanvas,
      stageStateRef.current.title,
      stageStateRef.current.aspect,
      stageStateRef.current.accentColor,
      stageStateRef.current.clips
    );
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    screenTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: screenTex,
      roughness: 0.2,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveMap: screenTex,
      emissiveIntensity: 0.22,
    });

    const displayAssembly = new THREE.Group();
    displayAssembly.position.y = 1.95;

    const frameOuter = new THREE.Mesh(new THREE.BoxGeometry(1.55, 2.45, 0.12), matteChassisMat);
    frameOuter.castShadow = true;
    displayAssembly.add(frameOuter);

    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 2.26), screenMat);
    screenMesh.position.z = 0.064;
    displayAssembly.add(screenMesh);

    const topAccentBar = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.07, 0.05), accentTrimMat);
    topAccentBar.position.set(0, 1.24, 0.05);
    displayAssembly.add(topAccentBar);

    const sideRailLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.38, 0.15), brushedMetalMat);
    sideRailLeft.position.set(-0.79, 0, 0);
    displayAssembly.add(sideRailLeft);

    const sideRailRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.38, 0.15), brushedMetalMat);
    sideRailRight.position.set(0.79, 0, 0);
    displayAssembly.add(sideRailRight);

    monitorGroup.add(displayAssembly);
    scene.add(monitorGroup);

    const monitorShadow = new THREE.Mesh(new THREE.CircleGeometry(1.65, 32), contactMat);
    monitorShadow.rotation.x = -Math.PI / 2;
    monitorShadow.position.set(0, 0.015, 0);
    scene.add(monitorShadow);

    // ---------------------------------------------------------
    // 2. COMPOSITE HERO MODEL B: Studio Cinema Camera Rig (8 parts)
    // ---------------------------------------------------------
    const camRigGroup = new THREE.Group();
    camRigGroup.position.set(-2.35, 0, 1.15);
    camRigGroup.rotation.y = Math.PI * 0.24;

    const hubPos = new THREE.Vector3(0, 0.98, 0);
    const legGeo = new THREE.CylinderGeometry(0.028, 0.024, 1, 12);
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const footPos = new THREE.Vector3(Math.sin(angle) * 0.46, 0.02, Math.cos(angle) * 0.46);
      const midPos = new THREE.Vector3().addVectors(hubPos, footPos).multiplyScalar(0.5);
      const legLen = hubPos.distanceTo(footPos);
      const leg = new THREE.Mesh(legGeo, brushedMetalMat);
      leg.scale.set(1, legLen, 1);
      leg.position.copy(midPos);
      leg.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(hubPos, footPos).normalize()
      );
      leg.castShadow = true;
      camRigGroup.add(leg);

      const footPad = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.04, 14), matteChassisMat);
      footPad.position.set(footPos.x, 0.02, footPos.z);
      camRigGroup.add(footPad);
    }

    const tripodHead = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.18, 20), matteChassisMat);
    tripodHead.position.y = 1.02;
    camRigGroup.add(tripodHead);

    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.62), matteChassisMat);
    camBody.position.set(0, 1.32, 0);
    camBody.castShadow = true;
    camRigGroup.add(camBody);

    // Lathe-turned cinema lens barrel
    const lensPoints = [
      new THREE.Vector2(0.14, 0),
      new THREE.Vector2(0.16, 0.14),
      new THREE.Vector2(0.19, 0.18),
      new THREE.Vector2(0.21, 0.38),
      new THREE.Vector2(0.18, 0.42),
    ];
    const lensGeo = new THREE.LatheGeometry(lensPoints, 28);
    lensGeo.rotateX(Math.PI / 2);
    const lensBarrel = new THREE.Mesh(lensGeo, brushedMetalMat);
    lensBarrel.position.set(0, 1.32, 0.3);
    lensBarrel.castShadow = true;
    camRigGroup.add(lensBarrel);

    const lensGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        roughness: 0.05,
        metalness: 0.1,
        clearcoat: 1.0,
        transparent: true,
        opacity: 0.72,
      })
    );
    lensGlass.rotation.x = Math.PI / 2;
    lensGlass.position.set(0, 1.32, 0.7);
    camRigGroup.add(lensGlass);

    const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.44), accentTrimMat);
    topHandle.position.set(0, 1.56, 0);
    camRigGroup.add(topHandle);

    scene.add(camRigGroup);

    const camShadow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28), contactMat);
    camShadow.rotation.x = -Math.PI / 2;
    camShadow.position.set(-2.35, 0.015, 1.15);
    scene.add(camShadow);

    // ---------------------------------------------------------
    // 3. COMPOSITE STUDIO SOFTBOX STAND (5 parts)
    // ---------------------------------------------------------
    const softboxGroup = new THREE.Group();
    softboxGroup.position.set(2.45, 0, 1.05);
    softboxGroup.rotation.y = -Math.PI * 0.25;

    const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 0.08, 24), matteChassisMat);
    standBase.position.y = 0.04;
    softboxGroup.add(standBase);

    const standPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.05, 16), brushedMetalMat);
    standPole.position.y = 1.06;
    standPole.castShadow = true;
    softboxGroup.add(standPole);

    const boxHousing = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.64, 0.22), matteChassisMat);
    boxHousing.position.set(0, 2.15, 0);
    boxHousing.rotation.x = 0.18;
    softboxGroup.add(boxHousing);

    const boxDiffuser = new THREE.Mesh(
      new THREE.PlaneGeometry(0.78, 0.54),
      new THREE.MeshBasicMaterial({ color: 0xfff3db })
    );
    boxDiffuser.position.set(0, 2.13, 0.115);
    boxDiffuser.rotation.x = 0.18;
    softboxGroup.add(boxDiffuser);

    scene.add(softboxGroup);

    const softboxShadow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), contactMat);
    softboxShadow.rotation.x = -Math.PI / 2;
    softboxShadow.position.set(2.45, 0.015, 1.05);
    scene.add(softboxShadow);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.55, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 2.8;
    controls.maxDistance = 12;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Smooth camera & aspect transition targets
    const camGoal = new THREE.Vector3(0, 2.35, 6.2);
    const targetGoal = new THREE.Vector3(0, 1.55, 0);
    let camTransitionActive = false;

    const scaleGoal = new THREE.Vector3(1, 1, 1);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function applyStateUpdates() {
      const st = stageStateRef.current;

      // Update screen aspect scale smoothly
      if (st.aspect === '9:16') scaleGoal.set(1, 1, 1);
      else if (st.aspect === '16:9') scaleGoal.set(1.75, 0.62, 1);
      else scaleGoal.set(1.25, 0.78, 1);

      // Update accent material & canvas preview
      accentTrimMat.color.set(st.accentColor);
      accentTrimMat.emissive.set(st.accentColor);
      drawScreenPreviewTexture(screenCanvas, st.title, st.aspect, st.accentColor, st.clips);
      screenTex.needsUpdate = true;

      // Lighting presets
      if (st.lightPreset === 'broadcast') {
        keyLight.color.setHex(0xfff1d6);
        keyLight.intensity = 2.2;
        rimLight.intensity = 1.15;
        hemiLight.intensity = 0.85;
      } else if (st.lightPreset === 'warm') {
        keyLight.color.setHex(0xffc999);
        keyLight.intensity = 2.6;
        rimLight.intensity = 0.6;
        hemiLight.intensity = 0.65;
      } else {
        keyLight.color.setHex(0xe2e8f0);
        keyLight.intensity = 1.4;
        rimLight.intensity = 0.45;
        hemiLight.intensity = 0.45;
      }

      // Camera preset goals
      if (st.camPreset === 'front') {
        camGoal.set(0, 2.25, 5.8);
        targetGoal.set(0, 1.65, 0);
      } else if (st.camPreset === 'rig') {
        camGoal.set(-3.2, 2.05, 3.8);
        targetGoal.set(-1.3, 1.35, 0.6);
      } else {
        camGoal.set(4.6, 3.4, 7.2);
        targetGoal.set(0, 1.45, 0);
      }
      camTransitionActive = true;
    }

    function requestRender() {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Smooth exponential damping for display aspect morph & camera preset
        let needsMore = false;
        const dampAlpha = isSoftwareGl ? 1 : 1 - Math.exp(-8 * dt);
        displayAssembly.scale.lerp(scaleGoal, dampAlpha);
        if (displayAssembly.scale.distanceTo(scaleGoal) > 0.005) needsMore = true;

        if (camTransitionActive) {
          camera.position.lerp(camGoal, dampAlpha);
          controls.target.lerp(targetGoal, dampAlpha);
          if (
            camera.position.distanceTo(camGoal) < 0.02 &&
            controls.target.distanceTo(targetGoal) < 0.02
          ) {
            camTransitionActive = false;
          } else {
            needsMore = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsMore) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    triggerUpdateRef.current = () => {
      applyStateUpdates();
      requestRender();
    };

    const onControlStart = () => {
      camTransitionActive = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 1200;
      const h = container.clientHeight || 680;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    applyStateUpdates();
    requestRender();

    return () => {
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      controls.dispose();
      floorTex.dispose();
      shadowTex.dispose();
      screenTex.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative h-[calc(100vh-4.1rem)] w-full overflow-hidden bg-[#0B0D12]">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={mountRef}
        data-testid="threejs-stage-canvas"
        className="h-full w-full"
      />

      {/* Minimal Top-Left Stage Identification */}
      <div className="pointer-events-none absolute top-5 left-6 z-10">
        <p className="font-mono text-xs text-slate-400">3D Broadcast Reference Stage</p>
        <h2 className="mt-1 font-display text-xl font-bold text-white">
          {workspace?.title || 'CLIPPAH 3D Stage'}
        </h2>
      </div>

      {/* Collapsible Bottom Control Dock (No backdrop-filter over WebGL!) */}
      <div className="pointer-events-auto absolute bottom-5 left-1/2 z-20 w-[min(860px,94vw)] -translate-x-1/2">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-t-lg border border-b-0 border-white/15 bg-[#131722] px-3 py-1 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            {dockCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {dockCollapsed ? 'Show Stage Controls' : 'Hide Controls'}
          </button>
        </div>

        {!dockCollapsed && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 bg-[#131722] px-4 py-3 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Frame</span>
              {(['9:16', '16:9', '1:1'] as AspectRatioProfile[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspect(ratio)}
                  className={`rounded-md px-2.5 py-1 font-mono text-xs font-medium cursor-pointer ${
                    aspect === ratio ? 'bg-[var(--accent)] text-white' : 'bg-[#0B0D12] text-slate-300 hover:text-white'
                  }`}
                >
                  {ratio}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Camera</span>
              {(
                [
                  { id: 'front', label: 'Stage Front' },
                  { id: 'rig', label: 'Camera Rig' },
                  { id: 'wide', label: 'Wide Studio' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCamPreset(c.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    camPreset === c.id ? 'bg-[#1C2232] text-white border border-white/25' : 'bg-[#0B0D12] text-slate-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Lighting</span>
              {(
                [
                  { id: 'broadcast', label: 'Broadcast' },
                  { id: 'warm', label: 'Warm Key' },
                  { id: 'minimal', label: 'Minimal' },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLightPreset(l.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    lightPreset === l.id ? 'bg-[#1C2232] text-white border border-white/25' : 'bg-[#0B0D12] text-slate-400 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
