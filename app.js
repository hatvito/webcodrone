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

        readSerial();
    } catch (err) {
        console.error("序列埠連線失敗：", err);
        alert("無法開啟序列埠，請確認瀏覽器支援與裝置連線狀態。");
    }
});

// 讀取二進位串流，並加入詳細除錯日誌
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
                    
                    // 只要有收到資料，F12 主控台一定會印出這行
                    console.log("【收到原始位元組】長度:", value.length, value);

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
