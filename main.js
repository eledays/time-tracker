// --- Data model ---
let tasks = []; // {id, name, total(ms), runningSince(ms|null)}
let idCounter = 1;
const taskInput = document.getElementById('task-input');
const addBtn = document.getElementById('add-btn');
const resetBtn = document.getElementById('reset-btn');
const tasksContainer = document.getElementById('tasks-container');
const emptyHint = document.getElementById('empty-hint');
const totalTimeEl = document.getElementById('total-time');
const exportCsvBtn = document.getElementById('export-csv');
const exportXlsxBtn = document.getElementById('export-xlsx');
const pieCanvas = document.getElementById('pie-canvas');
const chartLegend = document.getElementById('chart-legend');
const ctx = pieCanvas.getContext('2d');

const COLORS = ["#4F46E5", "#06B6D4", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6", "#F472B6"];

// tick every second for UI updates
setInterval(() => {
    renderAll();
}, 1000);

// helpers
function formatMs(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

function currentTimeForTask(t) {
    const now = Date.now();
    const extra = t.runningSince ? (now - t.runningSince) : 0;
    return t.total + extra;
}

function totalMsAll() {
    return tasks.reduce((acc, t) => acc + currentTimeForTask(t), 0);
}

// --- LocalStorage ---
function saveTasksToLocalStorage() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    localStorage.setItem('idCounter', idCounter);
}

function loadTasksFromLocalStorage() {
    const savedTasks = localStorage.getItem('tasks');
    const savedIdCounter = localStorage.getItem('idCounter');
    if (savedTasks) {
        tasks = JSON.parse(savedTasks);
    }
    if (savedIdCounter) {
        idCounter = parseInt(savedIdCounter, 10);
    }
    tasks.sort((a, b) => a.id - b.id); // Сортируем задачи по убыванию ID (новые выше)
}

// --- UI actions ---
function addTask() {
    const name = taskInput.value.trim();
    if (!name) return;
    const newTask = { id: idCounter++, name, total: 0, runningSince: null };
    tasks.unshift(newTask); // Добавляем задачу в начало списка
    taskInput.value = '';
    saveTasksToLocalStorage(); // Save tasks after adding
    renderAll();
}

function toggleRunning(id) {
    const now = Date.now();
    tasks = tasks.map(t => {
        if (t.id === id) {
            if (t.runningSince) {
                // stop
                const elapsed = now - t.runningSince;
                return { ...t, runningSince: null, total: t.total + elapsed };
            } else {
                // start this task
                return { ...t, runningSince: now };
            }
        } else {
            // stop other running tasks
            if (t.runningSince) {
                const elapsed = now - t.runningSince;
                return { ...t, runningSince: null, total: t.total + elapsed };
            }
            return t;
        }
    });
    saveTasksToLocalStorage(); // Save tasks after toggling
    renderAll();
}

function resetAll() {
    if (!confirm('Сбросить все задачи и статистику?')) return;
    tasks = [];
    idCounter = 1;
    saveTasksToLocalStorage(); // Save tasks after resetting
    renderAll();
}

// --- Exports ---
function exportCSV() {
    const rows = [
        ['id', 'name', 'time_seconds', 'time_hh:mm:ss'],
        ...tasks.map(t => {
            const secs = Math.round(currentTimeForTask(t) / 1000);
            return [t.id, t.name, secs, formatMs(secs * 1000)];
        })
    ];
    const csv = rows.map(r => r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    a.download = `timetracker_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportXLSX() {
    if (typeof XLSX === 'undefined') {
        alert('XLSX библиотека не найдена. Убедитесь, что SheetJS подключён.');
        return;
    }
    const wsData = [
        ['id', 'name', 'time_seconds', 'time_hh:mm:ss'],
        ...tasks.map(t => {
            const secs = Math.round(currentTimeForTask(t) / 1000);
            return [t.id, t.name, secs, formatMs(secs * 1000)];
        })
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    XLSX.writeFile(wb, `timetracker_${stamp}.xlsx`);
}

// --- Chart ---
function drawPie() {
    // prepare data: name & value seconds
    const data = tasks.map(t => ({ name: t.name, value: Math.round(currentTimeForTask(t) / 1000) }))
        .filter(d => d.value > 0);
    const w = pieCanvas.width = pieCanvas.clientWidth * devicePixelRatio;
    const h = pieCanvas.height = pieCanvas.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    chartLegend.innerHTML = '';

    if (data.length === 0) {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#9ca3af';
        // ctx.font = `${14 * devicePixelRatio}px Inter, Arial`;
        // ctx.textAlign = 'center';
        // ctx.fillText('Нет данных — запустите задачу хотя бы на 1 секунду.', w / 2, h / 2);
        return;
    }

    const total = data.reduce((s, d) => s + d.value, 0);
    let start = -Math.PI / 2;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 3;

    data.forEach((d, i) => {
        const angle = (d.value / total) * Math.PI * 2;
        const end = start + angle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();

        // small label line
        const mid = (start + end) / 2;
        const lx = cx + Math.cos(mid) * (radius + 10);
        const ly = cy + Math.sin(mid) * (radius + 10);

        start = end;

        // legend
        const legendItem = document.createElement('div');
        legendItem.style.display = 'flex';
        legendItem.style.alignItems = 'center';
        legendItem.style.gap = '6px';
        legendItem.style.fontSize = '13px';
        const swatch = document.createElement('span');
        swatch.style.width = '12px';
        swatch.style.height = '12px';
        swatch.style.background = COLORS[i % COLORS.length];
        swatch.style.display = 'inline-block';
        swatch.style.borderRadius = '4px';
        legendItem.appendChild(swatch);
        const txt = document.createElement('span');
        txt.textContent = `${d.name}: ${d.value}s`;
        legendItem.appendChild(txt);
        chartLegend.appendChild(legendItem);
    });

    // donut hole
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // center text total seconds -> formatted
    ctx.fillStyle = '#111827';
    ctx.font = `${14 * devicePixelRatio}px Inter, Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(formatMs(total * 1000), cx, cy + (6 * devicePixelRatio));
}

// --- Rendering ---
function renderAll() {
    // tasks list
    const existingTasks = new Map();
    tasksContainer.querySelectorAll('.task').forEach(el => {
        const id = parseInt(el.dataset.id, 10);
        existingTasks.set(id, el);
    });

    tasks.forEach(t => {
        const curMs = currentTimeForTask(t);
        const running = !!t.runningSince;

        let el = existingTasks.get(t.id);
        if (!el) {
            // Create new task element if it doesn't exist
            el = document.createElement('div');
            el.className = 'task';
            el.dataset.id = t.id;

            // left
            const left = document.createElement('div');
            left.className = 'left';
            const title = document.createElement('div');
            title.className = 'title';
            left.appendChild(title);
            const time = document.createElement('div');
            time.className = 'time';
            left.appendChild(time);
            el.appendChild(left);

            // right
            const right = document.createElement('div');
            right.className = 'actions';
            const idEl = document.createElement('div');
            idEl.className = 'id';
            right.appendChild(idEl);
            const btn = document.createElement('button');
            btn.className = 'btn toggle';
            btn.addEventListener('click', () => toggleRunning(t.id));
            right.appendChild(btn);
            el.appendChild(right);

            // Insert the task element at the top of the container
            tasksContainer.prepend(el);
        }

        // Update task element
        el.className = 'task' + (running ? ' active' : '');
        el.querySelector('.title').textContent = t.name;
        el.querySelector('.time').textContent = formatMs(curMs);
        el.querySelector('.id').textContent = 'ID ' + t.id;
        const btn = el.querySelector('.btn.toggle');
        btn.className = 'btn toggle ' + (running ? 'stop' : 'start');
        btn.textContent = running ? 'Остановить' : 'Запуск';

        // Remove from map to track unused elements
        existingTasks.delete(t.id);
    });

    // Remove unused task elements
    existingTasks.forEach(el => el.remove());

    // Show or hide empty hint
    emptyHint.style.display = tasks.length === 0 ? 'block' : 'none';

    // total
    totalTimeEl.textContent = formatMs(totalMsAll());

    // chart
    drawPie();
}

// --- events wiring ---
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask(); });
taskInput.addEventListener('input', () => {
    if (taskInput.value.trim()) {
        addBtn.classList.add('add');
    } else {
        addBtn.classList.remove('add');
    }
});
resetBtn.addEventListener('click', resetAll);
exportCsvBtn.addEventListener('click', exportCSV);
exportXlsxBtn.addEventListener('click', exportXLSX);

// initial render
loadTasksFromLocalStorage(); // Load tasks on initialization
renderAll();

// resize observer to redraw canvas on width changes
new ResizeObserver(() => drawPie()).observe(pieCanvas);