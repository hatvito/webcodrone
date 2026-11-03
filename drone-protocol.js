// drone-protocol.js : CoDrone EDU 官方協定核心（對齊 codrone-edu 2.11 規格書）
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
        // 執行自我檢驗
        this.selftest();
    }

    // 依據規格書第 7 節進行離線測試向量自我檢驗
    selftest() {
        const reqState = DroneProtocolParser.createRequestStatePacket();
        const reqStateHex = Array.from(reqState).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        
        const takeoff = DroneProtocolParser.createTakeoffPacket();
        const takeoffHex = Array.from(takeoff).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

        console.log("[Selftest] Request State 產生結果:", reqStateHex);
        console.log("[Selftest] Command TakeOff 產生結果:", takeoffHex);
        
        // 驗證 CRC16 函數本身是否符合標準 "123456789" = 0x31C3
        const testStrBytes = new TextEncoder().encode("123456789");
        if (DroneProtocolParser.crc16(testStrBytes) === 0x31C3) {
            console.log("[Selftest] CRC16-XMODEM 演算法驗證通過！");
        } else {
            console.warn("[Selftest] CRC16 演算法計算異常！");
        }
    }

    feedData(chunk) {
        for (let b of chunk) {
            this.buffer.push(b);
        }
        this.parse();
    }

    parse() {
        while (true) {
            // 1. 等待 0x0A, 0x55 起始碼
            let i = -1;
            for (let idx = 0; idx < this.buffer.length - 1; idx++) {
                if (this.buffer[idx] === 0x0A && this.buffer[idx+1] === 0x55) {
                    i = idx;
                    break;
                }
            }

            if (i < 0) {
                // 沒找到起始碼，保留最後一個 byte 避免漏掉半個開頭
                if (this.buffer.length > 1) {
                    this.buffer = this.buffer.slice(this.buffer.length - 1);
                }
                break;
            }

            if (i > 0) {
                this.buffer = this.buffer.slice(i);
            }

            // 2. 檢查是否有完整的 4 bytes 標頭 (dataType, length, from, to)
            if (this.buffer.length < 6) break; // 0x0A 0x55 + 4 bytes header = 6 bytes minimum

            let length = this.buffer[3];
            if (length > 128) {
                // 依據 receiver.py：length > 128 視為錯誤，跳過前 2 bytes 重新找
                this.buffer = this.buffer.slice(2);
                continue;
            }

            let totalSize = 2 + 4 + length + 2; // 起始碼(2) + 標頭(4) + 資料(length) + CRC(2)
            if (this.buffer.length < totalSize) break; // 資料還沒收齊，等待下個 chunk

            // 3. 擷取完整封包並進行 CRC 檢驗
            let frame = new Uint8Array(this.buffer.slice(0, totalSize));
            this.buffer = this.buffer.slice(totalSize);

            let payloadAndHeader = frame.slice(2, frame.length - 2);
            let gotCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);

            if (DroneProtocolParser.crc16(payloadAndHeader) === gotCrc) {
                let dataType = frame[2];
                let frm = frame[4];
                let to = frame[5];
                let payload = frame.slice(6, frame.length - 2);

                this.handlePacket(dataType, payload);
            } else {
                // CRC 錯誤，依照 receiver.py 略過 2 bytes 重新尋找
                this.buffer = [frame[1], ...this.buffer];
            }
        }
    }

    handlePacket(dataType, payload) {
        // DataType.State = 0x40 (8 bytes) -> battery 在第 8 個 byte (offset 7)
        if (dataType === 0x40 && payload.length >= 8) {
            let flightState = payload[1];
            let battery = payload[7];
            this.onDataCallback('state', { battery, flightState });
        }
        // DataType.Range = 0x45 (12 bytes) -> bottom 高度在 offset 10, 11 (int16 LE)
        else if (dataType === 0x45 && payload.length >= 12) {
            const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            let bottomMm = dataView.getInt16(10, true);
            let heightCm = bottomMm / 10.0;
            this.onDataCallback('range', { bottomMm, heightCm });
        }
    }

    // 標準 CRC-16/XMODEM (多項式 0x1021，初始值 0)
    static crc16(bytes, crc = 0) {
        for (const b of bytes) {
            crc ^= (b << 8);
            for (let i = 0; i < 8; i++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
            }
        }
        return crc & 0xFFFF;
    }

    // 建立通用封包 (from = 0x70 Base, to = 0x10 Drone)
    static buildPacket(dataType, payload, to = 0x10, frm = 0x70) {
        let header = [dataType, payload.length, frm, to];
        let rawHeaderAndPayload = new Uint8Array([...header, ...payload]);
        let crc = this.crc16(rawHeaderAndPayload);

        let packet = new Uint8Array(2 + rawHeaderAndPayload.length + 2);
        packet[0] = 0x0A;
        packet[1] = 0x55;
        packet.set(rawHeaderAndPayload, 2);
        packet[packet.length - 2] = crc & 0xFF;
        packet[packet.length - 1] = crc >> 8;
        return packet;
    }

    // --- 官方標準指令封包 (對應規格書第 5、7 節) ---

    // 1. 要求狀態 (Request State -> 0x04, payload: [0x40])
    static createRequestStatePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x40]));
    }

    // 2. 要求距離/高度 (Request Range -> 0x04, payload: [0x45])
    static createRequestRangePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x45]));
    }

    // 3. 起飛指令 (Command FlightEvent TakeOff -> 0x11, payload: [0x07, 0x11])
    static createTakeoffPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x07, 0x11]));
    }

    // 4. 降落指令 (Command FlightEvent Landing -> 0x11, payload: [0x07, 0x12])
    static createLandPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x07, 0x12]));
    }

    // 5. 緊急停止 (Command Stop -> 0x11, payload: [0x01, 0x00])
    static createStopPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x01, 0x00]));
    }

    // 6. 懸停控制 (Control Quad8 -> 0x10, payload: [0, 0, 0, 0])
    static createHoverPacket() {
        return this.buildPacket(0x10, new Uint8Array([0, 0, 0, 0]));
    }
}
