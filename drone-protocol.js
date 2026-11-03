// drone-protocol.js : CoDrone EDU 通訊協定解析與編包核心（支援 0x40 狀態與 0x71/0x30 IMU 姿態解析）
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
    }

    feedData(chunk) {
        this.buffer.push(...chunk);
        this.parse();
    }

    parse() {
        while (this.buffer.length >= 6) {
            let headerIndex = -1;
            for (let i = 0; i < this.buffer.length - 1; i++) {
                if (this.buffer[i] === 0x0A && this.buffer[i+1] === 0x55) {
                    headerIndex = i;
                    break;
                }
            }

            if (headerIndex === -1) {
                this.buffer = this.buffer.slice(-1);
                break;
            }
            if (headerIndex > 0) {
                this.buffer = this.buffer.slice(headerIndex);
            }

            if (this.buffer.length < 4) break;

            let length = this.buffer[3];
            let totalSize = 2 + 4 + length + 2; // Start(2) + Header(4) + Payload + CRC(2)

            if (this.buffer.length < totalSize) break;

            let frame = new Uint8Array(this.buffer.slice(0, totalSize));
            this.buffer = this.buffer.slice(totalSize);

            // 驗證 CRC16-XMODEM
            let payloadAndHeader = frame.slice(2, frame.length - 2);
            let gotCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
            
            if (DroneProtocolParser.crc16(payloadAndHeader) === gotCrc) {
                let dataType = frame[2];
                let payload = frame.slice(6, frame.length - 2);
                
                // 封包透視除錯
                console.log(`收到有效封包 Type: 0x${dataType.toString(16).toUpperCase()}, 長度: ${payload.length}`);

                this.handlePacket(dataType, payload);
            } else {
                console.warn("CRC 檢查失敗的封包");
            }
        }
    }

    handlePacket(dataType, payload) {
        // 1. 狀態與電池回報 (0x40)
        if (dataType === 0x40 && payload.length >= 8) {
            let battery = payload[7];
            let flightState = payload[1];
            this.onDataCallback('state', { battery, flightState });
        }
        // 2. IMU 姿態與動作回報 (支援 0x71 或 0x30)
        else if ((dataType === 0x71 || dataType === 0x30) && payload.length >= 6) {
            const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            // 嘗試解析前三個 Int16 作為 Roll, Pitch, Yaw
            let roll = dataView.getInt16(0, true) / 100.0;
            let pitch = dataView.getInt16(2, true) / 100.0;
            let yaw = dataView.getInt16(4, true) / 100.0;
            this.onDataCallback('motion', { roll, pitch, yaw });
        }
    }

    // CRC16-XMODEM (多項式 0x1021)
    static crc16(data, crc = 0) {
        for (let b of data) {
            crc ^= (b << 8);
            for (let i = 0; i < 8; i++) {
                if (crc & 0x8000) {
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    crc = (crc << 1) & 0xFFFF;
                }
            }
        }
        return crc & 0xFFFF;
    }

    // 建立通用 Byrobot 封包
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

    // 要求狀態封包 (Request State -> 取得電池與連線狀態)
    static createRequestStatePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x40]));
    }

    // 起飛指令封包
    static createTakeoffPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x20, 0x10, 0x01, 0x01]));
    }

    // 降落指令封包
    static createLandPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x20, 0x10, 0x01, 0x02]));
    }
}
