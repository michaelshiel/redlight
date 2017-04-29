var noble = require('noble');
var Promise = require('bluebird');
var sleep = require('sleep');
var EventEmitter = require('events');

var found = false;

function write(c, data) {
    return new Promise((resolve, reject) => {
        var d = new Buffer(data);
        console.log('Sending', d.toString('hex'));
        c.write(d, false, error => {
            if (error) {
                console.log('Write error', error);
                reject(error);
            } else {
                console.log('Wrote:', d);
                resolve();
            }
        });
    });
}

function addr2array(addr) {
    var parts = addr.split(':');

    if (parts.length !== 6) {
        return null;
    }

    var out = [];

    for (var i = 0; i < 6; i++) {
        var part = parts[i];
        if (part.length !== 2) {
            return null;
        } else {
            var hi = char2hex(part[0]);
            var lo = char2hex(part[1]);

            out[i] = hi << 4 | lo;
        }
    }

    return out;
}

function char2hex(char) {
    if (char >= '0' && char <= '9') {
        return char.charCodeAt(0) - '0'.charCodeAt(0);
    } else if (char >= 'a' && char <= 'f') {
        return char.charCodeAt(0) - 'a'.charCodeAt(0) + 10;
    }

    return 0x00;
}

class RedLight {
    constructor(peripheral) {
        this.peripheral = peripheral;
        this.address = peripheral.address;
        this.addrArray = addr2array(this.address);
        this.characteristics = {};

        console.log('Light', this.address);
    }

    connect() {
        this.peripheral.connect(error => {
            if (error) {
                throw error;
            }

            this.peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                for (var i in characteristics) {
                    var c = characteristics[i];
                    this.characteristics[c.uuid] = c;
                }

                this.fff1 = this.characteristics['fff1'];
                this.fff2 = this.characteristics['fff2'];

                if (!(this.fff1 && this.fff2)) {
                    throw new Error("Didn't find all the characteristics.");
                }

                this.fff1.on('data', (data, isNotify) => {
                    console.log('Notify Data', data.toString('hex'));
                    if (data[0] === 85 && data[1] === 0x01 && data.length === 5) {
                        this.setTimeout(1).then(() => {
                            this.flash(0);
                        });
                    } else if (data[0] === 98 && data[1] === 85 && data[2] === 1) {
                    }
                });
                this.fff1.subscribe(error => {
                    console.log('Subscribed', error ? error : 'successfully.');
                    this.authorize();
                });
            });
        });
    }

    flash(pattern) {
        return this.sendCommand([98, 85, 16 + pattern, -57 + pattern]);
    }

    setTimeout(timeout) {
        return this.sendCommand([98, 85, 1, 6, -68, timeout]);
    }

    authorize() {
        return this.sendCommand([85, 1, 6, ...this.addrArray]);
    }

    sendCommand(command) {
        return new Promise((resolve, reject) => {
            this.fff2.write(new Buffer(command), false, error => {
                if (error) {
                    reject(error);
                }
                console.log('Wrote', command);
                resolve();
            });
        });
    }
}

class Party extends EventEmitter {
    lightItUp() {
        noble.on('discover', this.discoveredPeripheral.bind(this));
        noble.on('stateChange', state => {
            if (state !== 'poweredOn') {
                return;
            }

            console.log('Getting the party started');
            noble.startScanning(['fff0']);
        });
    }

    discoveredPeripheral(peripheral) {
        if (peripheral.address.indexOf('44:bf:e3:10:62:6e') === 0) {
            this.emit('light', new RedLight(peripheral));
        }
    }
}

var p = new Party();
p.on('light', light => {
    light.connect();
});
p.lightItUp();

var myaddr = '44:bf:e3:10:62:6e';
var whoaddr = '44:bf:e3:16:1c:ba';

var who = [0x44, 0xbf, 0xe3, 0x16, 0x1c, 0xba];
var timeout = 1;
//var daddr = [0x44, 0xbf, 0xe3, 0x10, 0x62, 0x6e];
var daddr = [68, -65, -29, 16, 98, 110];
var addr = [0x60, 0x03, 0x08, 0x91, 0xe5, 0x53];
var p1 = [85, 1, 6, ...daddr]; // address
var p2 = [98, 85, 2, 6, timeout, ...daddr]; // 30, address
var flash2 = [98, 85, 17, -56];
var flash1 = [98, 85, 16, -57];
var m1 = [85, 1, 1, 1, 88];
var m2 = [98, 85, 1, 6, -68, timeout];
var d = [98, 85, 32, -41];

var ch = {};

function periph(peripheral) {
    console.log('Found:', peripheral.advertisement.localName);
    console.log(peripheral.uuid, peripheral.address);

    peripheral.uuid.indexOf('4be') !== -1 &&
        peripheral.connect(error => {
            console.log('connected', peripheral.address, peripheral.uuid);
            console.log(peripheral.advertisement);

            if (peripheral.address.indexOf(whoaddr) === -1) {
                console.log('Wrong device', peripheral.address);
                peripheral.disconnect();
            } else {
                found = true;
                noble.stopScanning();
                console.log('Found', peripheral.address.split(':'));

                peripheral.discoverAllServicesAndCharacteristics((error, services, characteristics) => {
                    for (var i in characteristics) {
                        let c = characteristics[i];
                        ch[c.uuid] = c;
                        console.log(c.uuid, c.properties);
                    }

                    var c = ch['fff2'];

                    if (ch['fff1']) {
                        ch['fff1'].on('data', (data, isNotify) => {
                            var string = data.toString('ascii');
                            console.log('Notify Data', isNotify, data && data.toString('ascii'));
                            console.log(data.toString('hex'));

                            console.log(data[0], data[1], data[2]);
                            if (data[0] === 85 && data[1] === 0x01 && data.length === 5) {
                                write(c, m2).then(() => {
                                    write(c, flash1);
                                });
                            } else if (data[0] === 98 && data[1] === 85 && data[2] === 1) {
                                //write(c, flash1);
                            }
                        });
                        ch['fff1'].subscribe(error => {
                            console.log('Subscribed', error ? error : 'successfully.');
                            write(c, p1);
                        });
                    }
                });
            }
        });
}
/*
noble.on('discover', periph);

noble.on('stateChange', state => {
    console.log('State', state);
    if (state !== 'poweredOn') {
        return;
    }

    console.log('Starting scan...');
    noble.startScanning(['fff0']);
});
*/
