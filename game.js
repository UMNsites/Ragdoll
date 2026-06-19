// Brisket Breaker - Ragdoll Faller

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

// --- STATE ---
let money = 0;
let totalBonesBroken = 0;
let currentMap = 1;
let unlockedMaps = [1];

// --- VERLET PHYSICS ---
class Point {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.px = x; this.py = y;
        this.radius = 5;
    }
    update() {
        let vx = (this.x - this.px) * 0.99;
        let vy = (this.y - this.py) * 0.99;
        this.px = this.x; this.py = this.y;
        this.x += vx; this.y += vy + 0.8; // Gravity
    }
}

class Stick {
    constructor(p1, p2, toughness = 10) {
        this.p1 = p1; this.p2 = p2;
        this.length = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        this.broken = false;
        this.toughness = toughness;
    }
    update() {
        if (this.broken) return;
        let dx = this.p2.x - this.p1.x;
        let dy = this.p2.y - this.p1.y;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) return;
        
        // Break bones if stretched too far!
        if (dist > this.length * 1.5) {
            this.broken = true;
            registerBrokenBone(this.p1.x, this.p1.y);
            return;
        }
        
        let diff = (this.length - dist) / dist * 0.5;
        let ox = dx * diff;
        let oy = dy * diff;
        this.p1.x -= ox; this.p1.y -= oy;
        this.p2.x += ox; this.p2.y += oy;
    }
}

// --- RAGDOLL ---
class Ragdoll {
    constructor(x, y) {
        this.head = new Point(x, y - 40);
        this.torso = new Point(x, y);
        this.lHand = new Point(x - 20, y + 10);
        this.rHand = new Point(x + 20, y + 10);
        this.lFoot = new Point(x - 10, y + 50);
        this.rFoot = new Point(x + 10, y + 50);
        
        this.points = [this.head, this.torso, this.lHand, this.rHand, this.lFoot, this.rFoot];
        
        this.sticks = [
            new Stick(this.head, this.torso, 12),
            new Stick(this.torso, this.lHand, 10),
            new Stick(this.torso, this.rHand, 10),
            new Stick(this.torso, this.lFoot, 15),
            new Stick(this.torso, this.rFoot, 15),
            new Stick(this.head, this.lHand, 12),
            new Stick(this.head, this.rHand, 12)
        ];
    }
    
    draw() {
        // Draw sticks (bones)
        ctx.lineWidth = 4;
        this.sticks.forEach(s => {
            ctx.strokeStyle = s.broken ? '#550000' : '#ffffff';
            ctx.beginPath();
            ctx.moveTo(s.p1.x, s.p1.y);
            ctx.lineTo(s.p2.x, s.p2.y);
            ctx.stroke();
        });
        
        // Draw points (joints)
        this.points.forEach(p => {
            ctx.fillStyle = p == this.head ? '#ffcc00' : '#ff4444';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }
}

// --- MAPS ---
let obstacles = [];

function loadMap(mapId) {
    currentMap = mapId;
    obstacles = [];
    
    if (mapId === 1) {
        document.getElementById('map-display').innerText = "Map: The Stairs";
        let y = 150;
        for(let i=0; i<5; i++) {
            obstacles.push({x: 100 + (i*100), y: y, w: 120, h: 20, type: 'block'});
            y += 80;
        }
        obstacles.push({x: 0, y: 580, w: 800, h: 20, type: 'block'});
    } else if (mapId === 2) {
        document.getElementById('map-display').innerText = "Map: Spike Pit";
        obstacles.push({x: 0, y: 580, w: 800, h: 20, type: 'block'});
        for(let i=0; i<10; i++) {
            obstacles.push({x: 50 + (i*75), y: 550, w: 20, h: 30, type: 'spike'});
        }
        obstacles.push({x: 200, y: 300, w: 400, h: 20, type: 'block'}); // Drop platform
    } else if (mapId === 3) {
        document.getElementById('map-display').innerText = "Map: The Crusher";
        obstacles.push({x: 0, y: 580, w: 800, h: 20, type: 'block'});
        // Moving Crushers
        obstacles.push({x: 100, y: 200, w: 150, h: 20, type: 'crusher', dir: 1, speed: 2});
        obstacles.push({x: 550, y: 350, w: 150, h: 20, type: 'crusher', dir: -1, speed: 3});
    }
    resetRagdoll();
}

// --- COLLISION ---
function resolveCollisions(point, obs) {
    // Simple AABB Collision for points
    if (point.x > obs.x && point.x < obs.x + obs.w && point.y > obs.y && point.y < obs.y + obs.h) {
        
        // Calculate impact force
        let vx = point.x - point.px;
        let vy = point.y - point.py;
        let force = Math.hypot(vx, vy);
        
        // Push out of obstacle
        let dx1 = point.x - obs.x;
        let dx2 = (obs.x + obs.w) - point.x;
        let dy1 = point.y - obs.y;
        let dy2 = (obs.y + obs.h) - point.y;
        
        let minOverlap = Math.min(dx1, dx2, dy1, dy2);
        
        if (minOverlap === dx1) { point.x = obs.x; point.px = point.x + vx * 0.8; }
        else if (minOverlap === dx2) { point.x = obs.x + obs.w; point.px = point.x + vx * 0.8; }
        else if (minOverlap === dy1) { 
            point.y = obs.y; 
            point.py = point.y + vy * (obs.type === 'spike' ? 1.5 : 0.5); // Spikes bounce you more
            if (force > 5) damageNearbyBones(point, force);
        }
        else if (minOverlap === dy2) { point.y = obs.y + obs.h; point.py = point.y + vy * 0.5; }
    }
}

function damageNearbyBones(point, force) {
    ragdoll.sticks.forEach(s => {
        if(!s.broken) {
            if (s.p1 === point || s.p2 === point) {
                s.toughness -= force;
                if (s.toughness <= 0) {
                    s.broken = true;
                    registerBrokenBone(point.x, point.y);
                }
            }
        }
    });
}

// --- EFFECTS & ECONOMY ---
function registerBrokenBone(x, y) {
    totalBonesBroken++;
    money += 5; // $5 per bone!
    updateUI();
    
    // Visual CRACK text
    const crack = document.createElement('div');
    crack.innerText = "CRACK! +$5";
    crack.className = 'crack-text';
    crack.style.left = (x + 200) + "px"; // Offset for canvas position
    crack.style.top = (y - 20) + "px";
    document.body.appendChild(crack);
    setTimeout(() => crack.remove(), 1000);
}

function updateUI() {
    document.getElementById('money-display').innerText = `Money: $${money}`;
    document.getElementById('bones-display').innerText = `Bones Broken: ${totalBonesBroken}`;
    
    // Update shop buttons
    document.querySelectorAll('.map-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`btn-map${currentMap}`).classList.add('active');
    
    document.getElementById('btn-map2').disabled = money < 100 && !unlockedMaps.includes(2);
    document.getElementById('btn-map3').disabled = money < 500 && !unlockedMaps.includes(3);
}

// --- INPUT (DRAG AND DROP) ---
let ragdoll = new Ragdoll(100, 50);
let isDragging = false;
let dragTarget = null;

canvas.addEventListener('mousedown', (e) => {
    let rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    
    ragdoll.points.forEach(p => {
        if (Math.hypot(p.x - mx, p.y - my) < 20) {
            isDragging = true;
            dragTarget = p;
        }
    });
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && dragTarget) {
        let rect = canvas.getBoundingClientRect();
        dragTarget.x = e.clientX - rect.left;
        dragTarget.y = e.clientY - rect.top;
        dragTarget.px = dragTarget.x; // Prevent slingshot while dragging
        dragTarget.py = dragTarget.y;
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    dragTarget = null;
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        resetRagdoll();
    }
});

function resetRagdoll() {
    ragdoll = new Ragdoll(100, 50);
}

// --- SHOP LOGIC ---
document.getElementById('btn-map1').onclick = () => loadMap(1);
document.getElementById('btn-map2').onclick = () => {
    if (unlockedMaps.includes(2) || money >= 100) {
        if (!unlockedMaps.includes(2)) { money -= 100; unlockedMaps.push(2); }
        loadMap(2); updateUI();
    }
};
document.getElementById('btn-map3').onclick = () => {
    if (unlockedMaps.includes(3) || money >= 500) {
        if (!unlockedMaps.includes(3)) { money -= 500; unlockedMaps.push(3); }
        loadMap(3); updateUI();
    }
};

// --- GAME LOOP ---
function drawObstacles() {
    obstacles.forEach(obs => {
        if (obs.type === 'spike') {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + obs.h);
            ctx.lineTo(obs.x + obs.w/2, obs.y);
            ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
            ctx.fill();
        } else {
            ctx.fillStyle = obs.type === 'crusher' ? '#8b0000' : '#555';
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        }
        
        // Move crushers
        if (obs.type === 'crusher') {
            obs.y += obs.dir * obs.speed;
            if (obs.y > 500 || obs.y < 100) obs.dir *= -1;
        }
    });
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Physics
    if (!isDragging) {
        ragdoll.points.forEach(p => p.update());
    }
    
    // Solve constraints
    for (let i = 0; i < 5; i++) {
        ragdoll.sticks.forEach(s => s.update());
        // Collisions
        ragdoll.points.forEach(p => {
            obstacles.forEach(obs => {
                // Spike collision is rough AABB
                resolveCollisions(p, obs);
            });
            // Floor bound
            if (p.y > 580) { p.y = 580; p.py = p.y + (p.y - p.py) * 0.5; }
        });
    }
    
    // Draw
    drawObstacles();
    ragdoll.draw();
    
    requestAnimationFrame(gameLoop);
}

// Init
loadMap(1);
updateUI();
gameLoop();
