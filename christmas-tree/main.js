// ===== MAIN APPLICATION =====
// Three.js Christmas Tree with Gesture Controls

// ===== CONFIGURATION =====
const CONFIG = {
    particleCount: 10000,
    treeHeight: 12,
    treeRadius: 7,
    transitionSpeed: 0.06,
    rotationSpeed: 0.008,
    autoRotate: true,
    autoRotateSpeed: 0.002,
    ornamentCount: 20, // Christmas ornaments (fewer, smaller)
    lightsCount: 80, // Light string
    colors: {
        gold: 0xffd700,
        red: 0xff2222,
        green: 0x00dd00,
        white: 0xffffff,
        blue: 0x4488ff,
        pink: 0xff66cc,
        orange: 0xff8800,
        purple: 0xaa44ff
    }
};

// ===== IMAGES =====
const SAMPLE_IMAGES = [
    '../hinh/z7326700462084_d02bb6716052953273e0c6072e069a32.jpg',
    '../hinh/z7326700472056_30571a02816fe4d5e9029c2318ca065c.jpg',
    '../hinh/z7326700472393_39b8d88b7197a04534eb89549af0c5ac.jpg',
    '../hinh/z7326700484819_1e647e5620d79d617e917fa17f47dbf2.jpg',
    '../hinh/z7326728321492_c132391ea28a748af058fb729d9f69c4.jpg',
    '../hinh/z7326728333619_6346659400153bb8dc6273de05342604.jpg'
];

// ===== GLOBAL VARIABLES =====
let scene, camera, renderer;
let particles, particleGeometry, particleMaterial;
let originalPositions = [];
let treePositions = [];
let currentPositions = [];
let imageSprites = [];
let imageTreePositions = []; // Hidden positions inside tree
let imageExplodedPositions = []; // Visible positions when exploded
let ornaments = []; // Christmas ornaments
let lights = []; // Light string
let handTracker;
let currentState = 'tree'; // 'tree', 'exploded', 'zoomed'
let morphProgress = 1; // 0 = exploded, 1 = tree
let treeRotation = 0;
let targetRotation = 0;
let starMesh;
let zoomedSprite = null; // Currently zoomed image
let previousState = 'tree'; // State before zooming
let selectedImageIndex = 0; // Currently selected image for zoom
let handPosition = { x: 0.5, y: 0.5 }; // Hand position for image selection

// ===== INITIALIZATION =====
async function init() {
    // Setup Three.js scene FIRST
    setupScene();
    setupParticles();
    setupOrnaments(); // Christmas balls
    setupTreeLights(); // Light string
    setupStar();
    setupImages();
    setupLights();

    // Hide loading screen immediately so user sees the tree
    document.getElementById('loading').classList.add('hidden');

    // Start animation loop immediately
    animate();

    // Create snowflakes
    createSnowflakes();

    // Setup hand tracking in background (non-blocking)
    setupHandTracking().catch(err => {
        console.log('Hand tracking not available, using keyboard controls');
        setupKeyboardControls();
    });
}

// Keyboard fallback controls
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        switch (e.key.toLowerCase()) {
            case 'f': // Fist - form tree
                if (currentState === 'zoomed') unzoomImage();
                currentState = 'tree';
                updateGestureUI('✊', 'Nắm tay - Hội tụ');
                break;
            case 'o': // Open - explode
                if (currentState === 'zoomed') unzoomImage();
                currentState = 'exploded';
                previousState = 'exploded';
                updateGestureUI('🖐️', 'Mở tay - Bung ảnh');
                break;
            case 'z': // Zoom selected image (hold)
                if (currentState === 'exploded' || previousState === 'exploded') {
                    zoomSelectedImage();
                    updateGestureUI('👌', 'OK - Zoom ảnh');
                }
                break;
            case 'arrowleft':
                if (currentState === 'exploded') {
                    // Select previous image
                    selectedImageIndex = Math.max(0, selectedImageIndex - 1);
                    updateGestureUI('◀️', `Ảnh ${selectedImageIndex + 1}/${SAMPLE_IMAGES.length}`);
                } else {
                    targetRotation -= 0.5;
                }
                break;
            case 'arrowright':
                if (currentState === 'exploded') {
                    // Select next image
                    selectedImageIndex = Math.min(SAMPLE_IMAGES.length - 1, selectedImageIndex + 1);
                    updateGestureUI('▶️', `Ảnh ${selectedImageIndex + 1}/${SAMPLE_IMAGES.length}`);
                } else {
                    targetRotation += 0.5;
                }
                break;
        }
    });

    // Unzoom when releasing Z key
    document.addEventListener('keyup', (e) => {
        if (e.key.toLowerCase() === 'z' && currentState === 'zoomed') {
            unzoomImage();
            currentState = previousState;
            updateGestureUI('🖐️', 'Đã trả về');
        }
    });

    // Update UI to show keyboard controls available
    const instructions = document.getElementById('instructions');
    instructions.innerHTML += `
        <div class="instruction" style="border-top: 1px solid rgba(255,255,255,0.2); margin-top: 10px; padding-top: 10px;">
            <span style="font-size: 11px; color: #ffd700;">⌨️ F=Hội tụ, O=Bung, ←→=Chọn ảnh, Z=Zoom</span>
        </div>
    `;
}

function setupScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 15;
    camera.position.y = 2;

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('christmas-canvas'),
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function setupParticles() {
    const count = CONFIG.particleCount;

    // Create geometry
    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    // Generate tree shape positions
    for (let i = 0; i < count; i++) {
        // Tree position (cone shape)
        const treePos = generateTreePosition(i, count);
        treePositions.push(treePos);

        // Random exploded position
        const explodedPos = {
            x: (Math.random() - 0.5) * 30,
            y: (Math.random() - 0.5) * 20,
            z: (Math.random() - 0.5) * 30
        };
        originalPositions.push(explodedPos);

        // Start in tree formation
        positions[i * 3] = treePos.x;
        positions[i * 3 + 1] = treePos.y;
        positions[i * 3 + 2] = treePos.z;

        currentPositions.push({ ...treePos });

        // Colors based on height - more decorations higher up
        // treePos.y goes from 0 (bottom) to treeHeight (top)
        const heightRatio = (treePos.y + 3) / (CONFIG.treeHeight + 3); // 0 to 1
        const decorationChance = 0.3 + heightRatio * 0.4; // 30% at bottom, 70% at top

        const colorChoice = Math.random();
        let color;
        if (colorChoice > decorationChance) {
            // Dark green tree foliage
            const greenShade = 0.25 + Math.random() * 0.25; // Dark green: 0.25-0.5
            color = new THREE.Color(0, greenShade, 0);
        } else {
            // Decorations - brighter at top
            const decoChoice = Math.random();
            if (decoChoice < 0.35) {
                color = new THREE.Color(CONFIG.colors.gold); // Gold
            } else if (decoChoice < 0.65) {
                color = new THREE.Color(CONFIG.colors.red); // Red
            } else if (decoChoice < 0.85) {
                color = new THREE.Color(CONFIG.colors.white); // White sparkle
            } else {
                color = new THREE.Color(CONFIG.colors.blue); // Blue lights
            }
        }

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        // Medium particle sizes
        sizes[i] = Math.random() * 0.35 + 0.2;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Create custom shader material for glowing particles
    particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            varying vec3 vColor;
            uniform float time;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Twinkle effect
                float twinkle = sin(time * 3.0 + position.x * 10.0 + position.y * 10.0) * 0.5 + 0.5;
                gl_PointSize = size * (200.0 / -mvPosition.z) * (0.7 + twinkle * 0.3);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                // Create circular gradient
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                // Glow effect
                float alpha = 1.0 - (dist * 2.0);
                alpha = pow(alpha, 1.5);
                
                // Add bloom effect
                vec3 glowColor = vColor + vec3(0.3) * (1.0 - dist * 2.0);
                
                gl_FragColor = vec4(glowColor, alpha);
            }
        `,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
}

function generateTreePosition(index, total) {
    const height = CONFIG.treeHeight;
    const maxRadius = CONFIG.treeRadius;

    // Proper cone distribution
    // y goes from top (height/2) to bottom (-height/2)
    const t = index / total; // 0 at top, 1 at bottom
    const y = (height / 2) - (t * height);

    // Radius proportional to distance from top (0 at top, maxRadius at bottom)
    const radiusAtHeight = maxRadius * t;

    // Golden angle spiral for even distribution
    const goldenAngle = 2.399963229728653;
    const angle = index * goldenAngle;

    // Random offset within the radius (fill the cone, not just surface)
    const r = radiusAtHeight * Math.sqrt(Math.random());
    const yOffset = (Math.random() - 0.5) * 0.5;

    return {
        x: Math.cos(angle) * r,
        y: y + yOffset,
        z: Math.sin(angle) * r
    };
}

// Create Christmas ornaments (balls)
function setupOrnaments() {
    const ornamentColors = [
        CONFIG.colors.red,
        CONFIG.colors.gold,
        CONFIG.colors.blue,
        CONFIG.colors.pink,
        CONFIG.colors.purple,
        CONFIG.colors.orange
    ];

    for (let i = 0; i < CONFIG.ornamentCount; i++) {
        // Position on tree surface
        const t = 0.1 + Math.random() * 0.8; // Between 10% and 90% of tree height
        const y = CONFIG.treeHeight * (1 - t) - CONFIG.treeHeight / 2;
        const radiusAtHeight = CONFIG.treeRadius * t * 0.9;
        const angle = Math.random() * Math.PI * 2;

        const geometry = new THREE.SphereGeometry(0.08 + Math.random() * 0.07, 12, 12);
        const material = new THREE.MeshBasicMaterial({
            color: ornamentColors[Math.floor(Math.random() * ornamentColors.length)],
            transparent: true,
            opacity: 0.9
        });

        const ornament = new THREE.Mesh(geometry, material);

        // Store original (tree) position
        const treeX = Math.cos(angle) * radiusAtHeight;
        const treeZ = Math.sin(angle) * radiusAtHeight;
        ornament.position.set(treeX, y, treeZ);

        // Store explosion target position (random scatter)
        ornament.userData = {
            treePos: { x: treeX, y: y, z: treeZ },
            explodedPos: {
                x: (Math.random() - 0.5) * 25,
                y: (Math.random() - 0.5) * 15,
                z: (Math.random() - 0.5) * 25
            }
        };

        scene.add(ornament);
        ornaments.push(ornament);
    }
}

// Create light string wrapping around tree
function setupTreeLights() {
    const lightColors = [
        CONFIG.colors.red,
        CONFIG.colors.gold,
        CONFIG.colors.blue,
        CONFIG.colors.green,
        CONFIG.colors.white,
        CONFIG.colors.pink
    ];

    for (let i = 0; i < CONFIG.lightsCount; i++) {
        // Spiral up the tree
        const t = i / CONFIG.lightsCount;
        const y = CONFIG.treeHeight * (1 - t) - CONFIG.treeHeight / 2;
        const radiusAtHeight = CONFIG.treeRadius * t * 0.95;
        const angle = t * Math.PI * 8; // 4 full spirals

        const geometry = new THREE.SphereGeometry(0.08, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: lightColors[i % lightColors.length],
            transparent: true,
            opacity: 1
        });

        const light = new THREE.Mesh(geometry, material);
        const treeX = Math.cos(angle) * radiusAtHeight;
        const treeZ = Math.sin(angle) * radiusAtHeight;
        light.position.set(treeX, y, treeZ);

        // Store positions for explosion
        light.userData = {
            baseColor: lightColors[i % lightColors.length],
            phase: Math.random() * Math.PI * 2,
            treePos: { x: treeX, y: y, z: treeZ },
            explodedPos: {
                x: (Math.random() - 0.5) * 30,
                y: (Math.random() - 0.5) * 20,
                z: (Math.random() - 0.5) * 30
            }
        };

        scene.add(light);
        lights.push(light);
    }
}

function setupStar() {
    // Create star geometry
    const starShape = new THREE.Shape();
    const outerRadius = 0.5;
    const innerRadius = 0.2;
    const points = 5;

    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        if (i === 0) {
            starShape.moveTo(x, y);
        } else {
            starShape.lineTo(x, y);
        }
    }
    starShape.closePath();

    const extrudeSettings = { depth: 0.1, bevelEnabled: false };
    const starGeometry = new THREE.ExtrudeGeometry(starShape, extrudeSettings);

    const starMaterial = new THREE.MeshBasicMaterial({
        color: CONFIG.colors.gold,
        emissive: CONFIG.colors.gold,
        emissiveIntensity: 1
    });

    starMesh = new THREE.Mesh(starGeometry, starMaterial);
    starMesh.position.set(0, CONFIG.treeHeight / 2 + 0.3, 0);
    starMesh.rotation.z = Math.PI;
    scene.add(starMesh);
}

function setupImages() {
    const textureLoader = new THREE.TextureLoader();
    const imageCount = SAMPLE_IMAGES.length;
    const orbitRadius = 8; // Distance from center when visible
    const hiddenRadius = 0.5; // Hidden inside tree center
    const yPosition = 0; // Height of images

    SAMPLE_IMAGES.forEach((url, index) => {
        textureLoader.load(url, (texture) => {
            const material = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0 // Start completely hidden
            });

            const sprite = new THREE.Sprite(material);

            // Base angle for this image (evenly distributed around circle)
            const baseAngle = (index / imageCount) * Math.PI * 2;

            // Hidden position (inside tree center)
            const treePos = {
                x: Math.cos(baseAngle) * hiddenRadius,
                y: yPosition,
                z: Math.sin(baseAngle) * hiddenRadius,
                angle: baseAngle
            };
            imageTreePositions.push(treePos);

            // Exploded position (orbiting around tree)
            const explodedPos = {
                x: Math.cos(baseAngle) * orbitRadius,
                y: yPosition,
                z: Math.sin(baseAngle) * orbitRadius,
                angle: baseAngle
            };
            imageExplodedPositions.push(explodedPos);

            // Start at hidden position
            sprite.position.set(treePos.x, treePos.y, treePos.z);
            sprite.scale.set(2, 2, 1);
            sprite.userData = {
                url: url,
                index: index,
                originalScale: 2,
                baseAngle: baseAngle,
                isSelected: false
            };

            scene.add(sprite);
            imageSprites.push(sprite);
        });
    });
}

function setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(CONFIG.colors.gold, 1, 20);
    pointLight.position.set(0, 5, 5);
    scene.add(pointLight);
}

async function setupHandTracking() {
    const videoElement = document.getElementById('webcam');
    handTracker = new HandTracker();

    try {
        await handTracker.init(videoElement);
        console.log('Hand tracking initialized!');

        handTracker.onGestureChange = (gesture) => {
            handleGestureChange(gesture);
        };
    } catch (error) {
        console.error('Failed to initialize hand tracking:', error);
        // Continue without hand tracking for testing
        updateGestureUI('none', 'Camera không khả dụng');
    }
}

// ===== GESTURE HANDLING =====
function handleGestureChange(gesture) {
    console.log('Gesture:', gesture);

    switch (gesture) {
        case 'fist':
            // If zoomed, unzoom first
            if (currentState === 'zoomed') {
                unzoomImage();
            }
            currentState = 'tree';
            updateGestureUI('✊', 'Nắm tay - Hội tụ');
            break;
        case 'open':
            // If zoomed, unzoom first
            if (currentState === 'zoomed') {
                unzoomImage();
            }
            currentState = 'exploded';
            previousState = 'exploded';
            updateGestureUI('🖐️', 'Mở tay - Bung ảnh');
            break;
        case 'ok':
            if (currentState === 'exploded' || previousState === 'exploded') {
                zoomToNearestImage();
                updateGestureUI('👌', 'OK - Zoom ảnh');
            }
            break;
        case 'none':
            // When releasing OK gesture, return to previous state
            if (currentState === 'zoomed') {
                unzoomImage();
                currentState = previousState;
                updateGestureUI('🖐️', 'Đã trả về');
            } else {
                updateGestureUI('🖐️', 'Đang chờ...');
            }
            break;
    }
}

function updateGestureUI(icon, text) {
    document.getElementById('gesture-icon').textContent = icon;
    document.getElementById('gesture-text').textContent = text;
}

function zoomToNearestImage() {
    if (imageSprites.length === 0) return;
    if (currentState === 'zoomed') return; // Already zoomed

    // Find the selected image (the one in front/center)
    let bestImage = null;

    imageSprites.forEach(sprite => {
        if (sprite.userData.isSelected) {
            bestImage = sprite;
        }
    });

    // Fallback to selectedImageIndex if no isSelected found
    if (!bestImage && selectedImageIndex >= 0 && selectedImageIndex < imageSprites.length) {
        bestImage = imageSprites[selectedImageIndex];
    }

    if (bestImage && bestImage.material.opacity > 0.3) {
        // Save previous state
        previousState = currentState;
        currentState = 'zoomed';
        zoomedSprite = bestImage;

        // Show zoom overlay
        const zoomOverlay = document.getElementById('zoom-overlay');
        const zoomedImage = document.getElementById('zoomed-image');
        zoomedImage.src = bestImage.userData.url;
        zoomOverlay.classList.remove('hidden');
    }
}

// Zoom the currently selected image (for keyboard control)
function zoomSelectedImage() {
    if (imageSprites.length === 0) return;
    if (currentState === 'zoomed') return; // Already zoomed
    if (selectedImageIndex < 0 || selectedImageIndex >= imageSprites.length) return;

    const selectedSprite = imageSprites[selectedImageIndex];
    if (!selectedSprite || selectedSprite.material.opacity < 0.3) return;

    // Save previous state
    previousState = currentState;
    currentState = 'zoomed';
    zoomedSprite = selectedSprite;

    // Show zoom overlay
    const zoomOverlay = document.getElementById('zoom-overlay');
    const zoomedImage = document.getElementById('zoomed-image');
    zoomedImage.src = selectedSprite.userData.url;
    zoomOverlay.classList.remove('hidden');
}

// ===== ANIMATION LOOP =====
function animate() {
    requestAnimationFrame(animate);

    // Update time uniform for twinkle effect
    particleMaterial.uniforms.time.value += 0.016;

    // Update morph progress based on current state
    // When zoomed, keep current position (don't change morphProgress)
    if (currentState === 'tree') {
        morphProgress = Math.min(1, morphProgress + CONFIG.transitionSpeed);
    } else if (currentState === 'exploded') {
        morphProgress = Math.max(0, morphProgress - CONFIG.transitionSpeed);
    }
    // 'zoomed' state: keep morphProgress unchanged

    // Update particle positions
    updateParticlePositions();

    // Update decorations (ornaments & lights)
    updateDecorations();

    // Update image visibility
    updateImageVisibility();

    // Update tree rotation based on hand
    updateRotation();

    // Rotate star
    if (starMesh) {
        starMesh.rotation.y += 0.01;
    }

    renderer.render(scene, camera);
}

function updateParticlePositions() {
    const positions = particleGeometry.attributes.position.array;

    for (let i = 0; i < currentPositions.length; i++) {
        const tree = treePositions[i];
        const exploded = originalPositions[i];

        // Interpolate between tree and exploded positions
        const t = easeInOutCubic(morphProgress);
        currentPositions[i].x = lerp(exploded.x, tree.x, t);
        currentPositions[i].y = lerp(exploded.y, tree.y, t);
        currentPositions[i].z = lerp(exploded.z, tree.z, t);

        positions[i * 3] = currentPositions[i].x;
        positions[i * 3 + 1] = currentPositions[i].y;
        positions[i * 3 + 2] = currentPositions[i].z;
    }

    particleGeometry.attributes.position.needsUpdate = true;
}

// Update decorations (ornaments and lights) position and effects
function updateDecorations() {
    const time = particleMaterial.uniforms.time.value;
    const explodeProgress = 1 - morphProgress; // 0 = tree, 1 = exploded
    const t = easeInOutCubic(explodeProgress);

    // Update ornaments
    ornaments.forEach(ornament => {
        if (ornament.userData.treePos && ornament.userData.explodedPos) {
            const tree = ornament.userData.treePos;
            const exploded = ornament.userData.explodedPos;

            // Apply rotation to tree position
            const treeRadius = Math.sqrt(tree.x * tree.x + tree.z * tree.z);
            const treeAngle = Math.atan2(tree.z, tree.x) + treeRotation;
            const rotatedTreeX = Math.cos(treeAngle) * treeRadius;
            const rotatedTreeZ = Math.sin(treeAngle) * treeRadius;

            ornament.position.x = lerp(rotatedTreeX, exploded.x, t);
            ornament.position.y = lerp(tree.y, exploded.y, t);
            ornament.position.z = lerp(rotatedTreeZ, exploded.z, t);
        }
    });

    // Update lights with twinkling
    lights.forEach(light => {
        if (light.userData.treePos && light.userData.explodedPos) {
            const tree = light.userData.treePos;
            const exploded = light.userData.explodedPos;

            // Apply rotation to tree position
            const treeRadius = Math.sqrt(tree.x * tree.x + tree.z * tree.z);
            const treeAngle = Math.atan2(tree.z, tree.x) + treeRotation;
            const rotatedTreeX = Math.cos(treeAngle) * treeRadius;
            const rotatedTreeZ = Math.sin(treeAngle) * treeRadius;

            light.position.x = lerp(rotatedTreeX, exploded.x, t);
            light.position.y = lerp(tree.y, exploded.y, t);
            light.position.z = lerp(rotatedTreeZ, exploded.z, t);

            // Twinkling effect
            const twinkle = Math.sin(time * 5 + light.userData.phase) * 0.5 + 0.5;
            light.material.opacity = 0.5 + twinkle * 0.5;
        }
    });
}

function unzoomImage() {
    const zoomOverlay = document.getElementById('zoom-overlay');
    zoomOverlay.classList.add('hidden');
    zoomedSprite = null;
}

function updateImageVisibility() {
    // Calculate target opacity and position based on morph progress
    // morphProgress: 1 = tree (hidden), 0 = exploded (visible)
    const explodeProgress = 1 - morphProgress; // 0 = tree, 1 = exploded
    const hiddenRadius = 0.5;
    const orbitRadius = 8;

    // Find image closest to front (highest Z value = facing camera)
    let frontImageIndex = 0;
    let maxZ = -Infinity;

    imageSprites.forEach((sprite, index) => {
        if (sprite.userData.baseAngle !== undefined) {
            // Calculate current angle with tree rotation
            const currentAngle = sprite.userData.baseAngle + treeRotation;

            // Interpolate radius based on explode progress
            const t = easeInOutCubic(explodeProgress);
            const currentRadius = lerp(hiddenRadius, orbitRadius, t);

            // Position in circular orbit
            const x = Math.cos(currentAngle) * currentRadius;
            const z = Math.sin(currentAngle) * currentRadius;
            sprite.position.x = x;
            sprite.position.y = 0;
            sprite.position.z = z;

            // Track which image is closest to front (camera at positive Z)
            if (z > maxZ && currentState === 'exploded') {
                maxZ = z;
                frontImageIndex = index;
            }
        }
    });

    // Update selected image to the one in front
    if (currentState === 'exploded') {
        selectedImageIndex = frontImageIndex;
    }

    // Second pass: update opacity and scale
    imageSprites.forEach((sprite, index) => {
        if (sprite.userData.baseAngle !== undefined) {
            // Animate opacity - only visible when exploded
            const targetOpacity = explodeProgress > 0.5 ? explodeProgress : 0;
            sprite.material.opacity = lerp(sprite.material.opacity, targetOpacity, 0.1);

            // Scale based on explode progress AND if it's the front image
            const isFront = index === selectedImageIndex && currentState === 'exploded';
            const baseScale = sprite.userData.originalScale * (0.5 + explodeProgress * 0.5);
            const frontBoost = isFront ? 1.5 : 1.0; // Front image is 50% bigger
            const targetScale = baseScale * frontBoost;
            const currentScale = sprite.scale.x;
            const newScale = lerp(currentScale, targetScale, 0.15);
            sprite.scale.set(newScale, newScale, 1);

            // Update selection state
            sprite.userData.isSelected = isFront;
        }
    });
}

function updateRotation() {
    // Get hand position if tracking - rotate based on X position
    if (handTracker && handTracker.isTracking && handTracker.landmarks) {
        const handPos = handTracker.getPosition();
        // handPos.x: 0 = right of screen, 1 = left of screen (mirrored webcam)
        // Convert to rotation: center = no rotation, left = rotate left, right = rotate right
        const centerOffset = handPos.x - 0.5; // -0.5 to 0.5
        const rotationSpeed = centerOffset * 0.15; // Scale for smooth rotation (increased sensitivity)
        targetRotation += rotationSpeed;
    } else if (CONFIG.autoRotate) {
        // Auto rotate when no hand is detected
        targetRotation += CONFIG.autoRotateSpeed;
    }

    // Smooth rotation
    treeRotation = lerp(treeRotation, targetRotation, 0.1);
    particles.rotation.y = treeRotation;

    if (starMesh) {
        starMesh.rotation.y = treeRotation + particleMaterial.uniforms.time.value * 0.3;
    }
    // Image rotation is handled in updateImageVisibility
}

// ===== UTILITY FUNCTIONS =====
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== SNOWFLAKES =====
function createSnowflakes() {
    setInterval(() => {
        const snowflake = document.createElement('div');
        snowflake.className = 'snowflake';
        snowflake.textContent = '❄';
        snowflake.style.left = Math.random() * 100 + 'vw';
        snowflake.style.fontSize = (Math.random() * 10 + 10) + 'px';
        snowflake.style.opacity = Math.random() * 0.5 + 0.5;
        snowflake.style.animationDuration = (Math.random() * 3 + 5) + 's';
        document.body.appendChild(snowflake);

        setTimeout(() => snowflake.remove(), 8000);
    }, 200);
}

// ===== ZOOM OVERLAY HANDLING =====
document.getElementById('close-zoom').addEventListener('click', () => {
    document.getElementById('zoom-overlay').classList.add('hidden');
    currentState = 'exploded';
});

// Close on background click
document.getElementById('zoom-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('zoom-overlay')) {
        document.getElementById('zoom-overlay').classList.add('hidden');
        currentState = 'exploded';
    }
});

// ===== START APPLICATION =====
window.addEventListener('load', init);
