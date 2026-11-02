// app.js : 主程式與 UI 互動繫結
import { initDigitalTwin } from './digital-twin.js';
import { DroneProtocolParser } from './drone-protocol.js';

// 初始化 3D 畫面
const twin = initDigitalTwin('canvas-container');

let port;
let reader;
let requestInterval = null;
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

        // 連線成功後，每 100ms 主動向無人機請求一次 RawMotion (0x30) 姿態資料
        if (port.writable) {
            requestInterval = setInterval(async () => {
                try {
                    const writer = port.writable.getWriter();
                    const reqPacket = DroneProtocolParser.createRequestPacket(0x20, 0x30); // 0x20 代表 Drone 裝置
                    await writer.write(reqPacket);
                    writer.releaseLock();
                } catch (e) {
                    console.error("發送請求失敗", e);
                }
            }, 100);
        }

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
                    
                    // 直接餵給協定解析器
                    parser.feedData(value);
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

// 控制按鈕事件綁定
document.getElementById('btn-takeoff').addEventListener('click', () => {
    console.log("發送起飛指令...");
});
document.getElementById('btn-land').addEventListener('click', () => {
    console.log("發送降落指令...");
});
document.getElementById('btn-stop').addEventListener('click', () => {
    console.log("發送緊急停止指令...");
});
