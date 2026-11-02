// drone-protocol.js : 官方對齊之 Byrobot 協議解析與指令編包核心
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
            // 1. 尋找 Byrobot 封包標頭: 0x0A, 0x55
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

            let dataType = this.buffer[2];
            let dataLength = this.buffer[3];
            let totalSize = 4 + dataLength + 2; // Header(4) + Payload + CRC(2)

            if (this.buffer.length < totalSize) break;

            let packet = this.buffer.slice(0, totalSize);
            this.buffer = this.buffer.slice(totalSize);

            this.handlePacket(dataType, packet);
        }
    }

    handlePacket(dataType, packet) {
        const payload = packet.slice(4, packet.length - 2);
        const dataView = new DataView(new Uint8Array(payload).buffer);

        // 接收並解析不同類型的資料封包
        if (dataType === 0x30) { // RawMotion (IMU 姿態原始數據)
            if (payload.length >= 6) {
                let roll = dataView.getInt16(0, true) / 100.0;
                let pitch = dataView.getInt16(2, true) / 100.0;
                let yaw = dataView.getInt16(4, true) / 100.0;
                this.onDataCallback('motion', { roll, pitch, yaw });
            }
        } 
        else if (dataType === 0x44) { // Range (ToF 測距雷達)
            if (payload.length >= 4) {
                let frontRange = dataView.getInt16(2, true);
                this.onDataCallback('range', { front: frontRange });
            }
        }
    }

    // ==========================================
    // 官方協議指令封包產生器 (Command Packet Builders)
    // ==========================================

    // 計算 Byrobot 協議標準 CRC16 (或累加校驗)
    static calculateChecksum(packetArray) {
        let crc = 0;
        for (let i = 2; i < packetArray.length; i++) {
            crc += packetArray[i];
        }
        return [crc & 0xFF, (crc >> 8) & 0xFF];
    }

    // 1. 起飛指令封包 (Takeoff)
    static createTakeoffPacket() {
        // Byrobot 標準 Flight Command: Target(0x20 = Drone), Cmd(Flight=0x10), Action(Takeoff=0x01)
        let payload = [0x20, 0x10, 0x01, 0x01]; 
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    // 2. 降落指令封包 (Landing)
    static createLandPacket() {
        let payload = [0x20, 0x10, 0x01, 0x02]; // Action(Land=0x02)
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    // 3. 緊急停止指令封包 (Stop / Cut Motor)
    static createStopPacket() {
        let payload = [0x20, 0x10, 0x01, 0x10]; // Action(Stop=0x10)
        let packet = [0x0A, 0x55, 0x11, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }

    // 4. 四維飛行控制搖桿封包 (Control: Roll, Pitch, Yaw, Throttle (-100 ~ 100))
    static createFlightControlPacket(roll = 0, pitch = 0, yaw = 0, throttle = 0) {
        // 將數值限制在 -100 到 100 之間
        const clamp = (val) => Math.max(-100, Math.min(100, Math.round(val)));
        
        let r = clamp(roll);
        let p = clamp(pitch);
        let y = clamp(yaw);
        let t = clamp(throttle);

        // 封包格式: Target, ControlMode, Roll, Pitch, Yaw, Throttle
        let payload = [0x20, 0x01, r, p, y, t];
        let packet = [0x0A, 0x55, 0x10, payload.length, ...payload];
        let crc = this.calculateChecksum(packet);
        packet.push(...crc);
        return new Uint8Array(packet);
    }
}
