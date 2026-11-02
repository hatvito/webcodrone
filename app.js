// app.js : 主程式與 UI 互動繫結
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

// 初始化 3D 畫面
const twin = initDigitalTwin('canvas-container');

let port;
let reader;
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
        // 確保鮑率與 CoDrone EDU 遙控器一致 (115200)
        await port.open({ baudRate: 115200 });

        statusText.textContent = "已連線";
        statusText.className = "text-sm text-emerald-400 font-medium";
        indicator.className = "w-3 h-3 bg-emerald-500 rounded-full shadow-[0_0_10px_#10b981]";
        connectBtn.textContent = "已連線";
        connectBtn.disabled = true;
        connectBtn.className = "bg-slate-700 text-slate-400 px-5 py-2 rounded-lg font-medium cursor-not-allowed";

        // 開始讀取序列埠資料
        readSerial();

    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認瀏覽器支援與裝置連線狀態。");
    }
});

// 讀取二進位串流
async function readSerial() {
    console.log("-> 進入 readSerial 監聽函式");
    try {
        while (port.readable) {
            reader = port.readable.getReader();
            console.log("-> 已成功取得 reader，開始讀取序列埠串流...");
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        console.log("-> 串流讀取結束 (done)");
                        break;
                    }
                    
                    if (value && value.length > 0) {
                        // console.log("【收到位元組】長度:", value.length, value);
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
        const writer = port.writable.getWriter();
        await writer.write(new Uint8Array(packetArray));
        writer.releaseLock();
        console.log("已發送指令封包:", packetArray);
    } catch (err) {
        console.error("發送指令失敗:", err);
    }
}

// 建立控制指令封包
function createCommandPacket(commandType, option = 0) {
    let payload = [0x20, 0x00, commandType, option]; 
    let length = payload.length;
    let packet = [0x0A, 0x55, 0x11, length, ...payload];
    let crc = 0;
    for (let i = 2; i < packet.length; i++) {
        crc += packet[i];
    }
    packet.push(crc & 0xFF, (crc >> 8) & 0xFF);
    return packet;
}

// 控制按鈕事件綁定
document.getElementById('btn-takeoff').addEventListener('click', async () => {
    console.log("網頁觸發：起飛！");
    const packet = createCommandPacket(0x01, 0x00);
    await sendCommandPacket(packet);
});

document.getElementById('btn-land').addEventListener('click', async () => {
    console.log("網頁觸發：降落！");
    const packet = createCommandPacket(0x02, 0x00);
    await sendCommandPacket(packet);
});

document.getElementById('btn-stop').addEventListener('click', async () => {
    console.log("網頁觸發：緊急停止！");
    const packet = createCommandPacket(0x10, 0x00);
    await sendCommandPacket(packet);
});
