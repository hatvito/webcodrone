// drone-protocol.js : 修正語法錯誤的協定核心
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
            let totalSize = 2 + 4 + length + 2; 

            if (this.buffer.length < totalSize) break;

            let frame = new Uint8Array(this.buffer.slice(0, totalSize));
            this.buffer = this.buffer.slice(totalSize);

            let payloadAndHeader = frame.slice(2, frame.length - 2);
            let gotCrc = frame[frame.length - 2] | (frame[frame.length - 1] << 8);
            
            if (DroneProtocolParser.crc16(payloadAndHeader) === gotCrc) {
                let dataType = frame[2];
                let payload = frame.slice(6, frame.length - 2);
                this.handlePacket(dataType, payload);
            }
        }
    }

    handlePacket(dataType, payload) {
        if (dataType === 0x40 && payload.length >= 8) {
            let battery = payload[7];
            let flightState = payload[1];
            this.onDataCallback('state', { battery, flightState });
        }
    }

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

    static buildPacket(dataType, payload, to = 0x10, frm = 0x70) {
        let header = [dataType, payload.length, frm, to];
        let rawHeaderAndPayload = new Uint8Array([...header, ...payload]);
        let crc = this.crc16(rawHeaderAndPayload);
        
        // 修正後的正確組合寫法 (移除原本多餘且報錯的匿名立即執行函數)
        let packet = new Uint8Array(2 + rawHeaderAndPayload.length + 2);
        packet[0] = 0x0A;
        packet[1] = 0x55;
        packet.set(rawHeaderAndPayload, 2);
        packet[packet.length - 2] = crc & 0xFF;
        packet[packet.length - 1] = crc >> 8;
        
        return packet;
    }

    static createRequestStatePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x40]));
    }

    static createTakeoffPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x20, 0x10, 0x01, 0x01]));
    }

    static createLandPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x20, 0x10, 0x01, 0x02]));
    }
}
