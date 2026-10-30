// digital-twin.js : 負責 3D 數位雙胞胎渲染
export function initDigitalTwin(containerId) {
    const container = document.getElementById(containerId);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 3, 5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // 燈光
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // 地板網格
    const grid = new THREE.GridHelper(10, 10, 0x4f46e5, 0x1e293b);
    grid.position.y = -1;
    scene.add(grid);

    // 無人機模型群組
    const droneGroup = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.2, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.3 })
    );
    droneGroup.add(body);

    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0xef4444 })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, -0.5);
    droneGroup.add(nose);

    scene.add(droneGroup);

    // 視窗自適應
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // 渲染循環
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    // 對外暴露更新姿態的介面
    return {
        updatePose(roll, pitch, yaw) {
            droneGroup.rotation.z = -THREE.MathUtils.degToRad(roll);
            droneGroup.rotation.x = THREE.MathUtils.degToRad(pitch);
            droneGroup.rotation.y = THREE.MathUtils.degToRad(yaw);
        }
    };
}
