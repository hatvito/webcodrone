// app.js : 主程式與 UI 互動繫結 (支援網頁端控制發送)
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

// 初始化 3D 畫面
const twin = initDigitalTwin('canvas-container');

let port;
let reader;
let writer;
const connectBtn = document.getElementById('connect-btn');
const statusText = document.getElementById('status-text');
const indicator = document.getElementById('connection-indicator');

// 建立協定解析器
const parser = new DroneProtocolParser((type, data) => {
    if (type === 'motion') {
        document.getElementById('val-roll').textContent = data.roll.toFixed(1) + '°';
        document.getElementById('val-pitch').textContent = data.pitch.toFixed(1) + '°';
        document.getElementById('val-yaw').textContent = data.yaw.toFixed(1) + '°';
        twin.updatePose(data.roll, data.pitch, data.yaw);
    } 
    else if (type === 'range') {
        document.getElementById('val-front-range').textContent = data.front + ' mm';
        const warning = document.getElementById('range-warning');
        warning.className = data.front < 300 ? "w-3 h-3 rounded-full bg-rose-500 animate-ping" : "w-3 h-3 rounded-full bg-emerald-500";
    }
});

// 序列埠連線按鈕
connectBtn.addEventListener('click', async () => {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        statusText.textContent = "已連線";
        statusText.className = "text-sm text-emerald-400 font-medium";
        indicator.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]";
        connectBtn.textContent = "已連線";
        connectBtn.disabled = true;
        connectBtn.className = "bg-slate-700 text-slate-400 px-5 py-2 rounded-lg font-medium cursor-not-allowed";

        // 啟動讀取串流
        readSerial();

    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認瀏覽器支援與裝置連線狀態。");
    }
});

// 讀取二進位串流
async function readSerial() {
    try {
        while (port.readable) {
            reader = port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value && value.length > 0) {
                        parser.feedData(value);
                    }
                }
            } catch (error) {
                console.error("讀取中斷錯誤：", error);
            } finally {
                reader.releaseLock();
            }
        }
    } catch (err) {
        console.error("Serial 讀取迴圈異常：", err);
    }
}

// 輔助函數：透過序列埠發送二進位指令封包
async function sendCommandPacket(packetArray) {
    if (!port || !port.writable) {
        console.warn("序列埠尚未連線或無法寫入");
        return;
    }
    try {
        const localWriter = port.writable.getWriter();
        await localWriter.write(new Uint8Array(packetArray));
        localWriter.releaseLock();
        console.log("已發送指令封包:", packetArray);
    } catch (err) {
        console.error("發送指令失敗:", err);
    }
}

// --- 網頁控制按鈕事件綁定 (把按鈕轉化為實體控制指令) ---

// 起飛按鈕 (發送起飛 Command 封包)
document.getElementById('btn-takeoff').addEventListener('click', async () => {
    console.log("網頁觸發：起飛！");
    // Byrobot 協定中，控制指令通常透過特定 DataType (如 0x10 控制 或 0x11 命令)
    // 這裡示範發送一個標準的起飛命令位元組陣列
    const takeoffPacket = [0x0A, 0x55, 0x11, 0x02, 0x20, 0x00, 0x01, 0x00]; // 結構範例
    // 計算簡單 CRC
    let crc = 0;
    for(let i=2; i<takeoffPacket.length; i++) crc += takeoffPacket[i];
    takeoffPacket.push(crc & 0xFF, (crc >> 8) & 0xFF);
    
    await sendCommandPacket(takeoffPacket);
});

// 降落按鈕
document.getElementById('btn-land').addEventListener('click', async () => {
    console.log("網頁觸發：降落！");
    const landPacket = [0x0A, 0x55, 0x11, 0x02, 0x20, 0x00, 0x02, 0x00];
    let crc = 0;
    for(let i=2; i<landPacket.length; i++) crc += landPacket[i];
    landPacket.push(crc & 0xFF, (crc >> 8) & 0xFF);

    await sendCommandPacket(landPacket);
});

// 緊急停止按鈕
document.getElementById('btn-stop').addEventListener('click', async () => {
    console.log("網頁觸發：緊急停止！");
    const stopPacket = [0x0A, 0x55, 0x11, 0x02, 0x20, 0x00, 0x10, 0x00];
    let crc = 0;
    for(let i=2; i<stopPacket.length; i++) crc += stopPacket[i];
    stopPacket.push(crc & 0xFF, (crc >> 8) & 0xFF);

    await sendCommandPacket(stopPacket);
});
