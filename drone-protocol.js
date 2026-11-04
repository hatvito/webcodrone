// drone-protocol.js : CoDrone EDU 完整通訊協定解析與編包核心
export class DroneProtocolParser {
    constructor(onDataCallback) {
        this.buffer = [];
        this.onDataCallback = onDataCallback;
        this.selftest();
    }

    selftest() {
        const testStrBytes = new TextEncoder().encode("123456789");
        if (DroneProtocolParser.crc16(testStrBytes) === 0x31C3) {
            console.log("[Selftest] CRC16-XMODEM 演算法驗證通過！");
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
            let i = -1;
            for (let idx = 0; idx < this.buffer.length - 1; idx++) {
                if (this.buffer[idx] === 0x0A && this.buffer[idx+1] === 0x55) {
                    i = idx;
                    break;
                }
            }

            if (i < 0) {
                if (this.buffer.length > 1) {
                    this.buffer = this.buffer.slice(this.buffer.length - 1);
                }
                break;
            }

            if (i > 0) {
                this.buffer = this.buffer.slice(i);
            }

            if (this.buffer.length < 6) break;

            let length = this.buffer[3];
            if (length > 128) {
                this.buffer = this.buffer.slice(2);
                continue;
            }

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
            } else {
                this.buffer = [frame[1], ...this.buffer];
            }
        }
    }

    handlePacket(dataType, payload) {
        if (dataType === 0x40 && payload.length >= 8) {
            let flightState = payload[1];
            let battery = payload[7];
            this.onDataCallback('state', { battery, flightState });
        }
        else if (dataType === 0x45 && payload.length >= 12) {
            const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            let bottomMm = dataView.getInt16(10, true);
            let heightCm = bottomMm / 10.0;
            this.onDataCallback('range', { bottomMm, heightCm });
        }
        else if ((dataType === 0x30 || dataType === 0x71) && payload.length >= 6) {
            const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            let roll = dataView.getInt16(0, true) / 100.0;
            let pitch = dataView.getInt16(2, true) / 100.0;
            let yaw = dataView.getInt16(4, true) / 100.0;
            this.onDataCallback('motion', { roll, pitch, yaw });
        }
    }

    static crc16(bytes, crc = 0) {
        for (const b of bytes) {
            crc ^= (b << 8);
            for (let i = 0; i < 8; i++) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
            }
        }
        return crc & 0xFFFF;
    }

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

    static createRequestStatePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x40]));
    }

    static createRequestRangePacket() {
        return this.buildPacket(0x04, new Uint8Array([0x45]));
    }

    static createRequestSensorPacket() {
        return this.buildPacket(0x04, new Uint8Array([0x30]));
    }

    static createTakeoffPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x07, 0x11]));
    }

    static createLandPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x07, 0x12]));
    }

    static createStopPacket() {
        return this.buildPacket(0x11, new Uint8Array([0x01, 0x00]));
    }

    static createHoverPacket() {
        return this.buildPacket(0x10, new Uint8Array([0, 0, 0, 0]));
    }
}
