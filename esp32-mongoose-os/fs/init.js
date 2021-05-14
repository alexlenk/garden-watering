load('api_aws.js');
load('api_config.js');
load('api_dash.js');
load('api_events.js');
load('api_gpio.js');
load('api_mqtt.js');
load('api_timer.js');
load('api_sys.js');
load('api_adc.js');
load('api_shadow.js');
//load('api_esp32.js');


let sensor = 34;
let relais = 12;
let alexa = 35;

let topic = 'devices/' + Cfg.get('device.id') + '/data';
let shadow_update_topic = '$aws/things/' + Cfg.get('device.id') + '/shadow/update';
let data = {humidity: 0, time: "", device: Cfg.get('device.id')};  // Device state
let state = {on: false, override: false, timer: 20*1000, threshold: 4000, wateron: 5*60*1000, pigeon: false};
let shadow_restored = false;


GPIO.set_mode(sensor, GPIO.MODE_INPUT);
GPIO.set_mode(alexa, GPIO.MODE_INPUT);
GPIO.set_mode(relais, GPIO.MODE_OUTPUT);
GPIO.write(relais, state.on);
ADC.enable(sensor);
ADC.enable(alexa);

let sensor_data = 0;
let timer_id = 0;

let sensor_array = [];
let counter = 1;

let active = false;

let alex_state = false;
let pigon_active = false;

MQTT.sub('devices/water/trigger', function(conn, topic, msg) {
  print(msg);
  msg = JSON.parse(msg);
  if(msg.mode === "duration") {
      let duration = msg.duration;
      state.on = true;
      GPIO.write(relais, state.on);
      reportState();

      Timer.set(1000 * duration, 0, function() {
        state.on = false;
        GPIO.write(relais, state.on);
        reportState();
      }, null);
  } else if (msg.mode === "switch") {
      state.on = msg.on;
      GPIO.write(relais, state.on);
      reportState();
  }
}, null);

let reportState = function() {
  //Shadow.update(0, {desired: null, reported: state});
  AWS.Shadow.update(0, state);
};


Timer.set(1000, Timer.REPEAT, function() {
	/*if(ADC.read(alexa) > 1000 && !alex_state) {
		print("Alexa on event");
		alex_state = true;
		state.on = true;

		GPIO.write(relais, state.on);
		reportState();
	} else if (ADC.read(alexa) < 10 && alex_state) {
		print("Alexa off event");
		alex_state = false;
		state.on = false;

		GPIO.write(relais, state.on);
		reportState();
	}*/
  
  
	if(state.pigeon && !pigon_active) {
      print("Pigeon Mode");
      pigon_active = true;
      Timer.set(1000*60*15, 0, function() {
        state.on = true;
        GPIO.write(relais, state.on);
        reportState();
        Timer.set(1000*5, 0, function() {
          	state.on = false;
			GPIO.write(relais, state.on);
          	pigon_active = false;
          	reportState();
        }, null);
      }, null);
    }
}, null);


/*MQTT.sub(topic, function(conn, topic, msg) {
	let msg_json = {};
	print('Topic:', topic, 'message:', msg);
	//print("Substr:", String(msg).substring(0,1), "Substr2:", String(msg).substring(-1,1));
	//if(str_starts_with(msg, "{") == 1) {
	msg_json = JSON.parse(msg);
	//}


}, null);*/

let read_act = function() {
	data.humidity = ADC.read(sensor);
	let now = Timer.now();
	let now_s = Timer.fmt("%Y-%m-%d %H:%M:%S", now);

	data.time = now_s;

	print('== Read: ', data.humidity);

	/*if(!state.override && !active) {
		if(data.humidity < state.threshold) {
			print('Relais on');
			state.on = true;
          	active = true;
          	Timer.set(state.wateron, Timer.REPEAT, function() {
            	active = false;
            }, null);
		} else {
			print('Relais off');
			state.on = false;
          	active = false;
		}
	}*/

	//GPIO.write(relais, state.on);
	//reportState();
};

/**********************************/
/* Handle AWS Shadow State Changes*/
/**********************************/

AWS.Shadow.setStateHandler(function(data, event, reported, desired, reported_metadata, desired_metadata) {
  if (event === AWS.Shadow.CONNECTED) {
  	
  } else if (event === AWS.Shadow.GET_ACCEPTED && !shadow_restored) {
  	shadow_restored = true;
  	print("== DEVICE SHADOW: RESTORING SHADOW");
  	//print("Desired: ", JSON.stringify(desired));
    for (let key in desired) {
    	if (state[key] !== undefined) state[key] = desired[key];
    	if (reported[key] !== undefined) reported[key] = desired[key];
    }
    MQTT.pub(shadow_update_topic, JSON.stringify({"state": {"desired": null}}), 0);
    for (let key in reported) {
    	if (state[key] !== undefined) state[key] = reported[key];
    }
    reportState();
    GPIO.write(relais, state.on);
    setTimer();
    read_act();
  } else if (event === AWS.Shadow.UPDATE_DELTA) {
  	print("== DEVICE SHADOW: UPDATING DELTA");

    for (let key in desired) {
    	if (state[key] !== undefined) state[key] = desired[key];

		if (key === 'reboot') {
	          Timer.set(750, 0, function() {  // incremented 'reboot' counter
	          Sys.reboot(500);                 // Sync and schedule a reboot
	        }, null);
	    } else if(key === 'timer') {
	    	print("== Changeing TIMER");
	    	setTimer();
	    }
		
    }
    MQTT.pub(shadow_update_topic, JSON.stringify({"state": {"desired": null}}), 0);
    reportState();
    GPIO.write(relais, state.on);
  }
  //print(JSON.stringify(reported), JSON.stringify(desired));
}, null);

/*Shadow.addHandler(function(event, obj) {
	print("SHADOW EVENT: ", event);
	print("SHADOW-OBJECT: ", JSON.stringify(obj));
  if (event === 'UPDATE_DELTA') {
    print('GOT DELTA:', JSON.stringify(obj));
    for (let key in obj) {  // Iterate over all keys in delta
      if (key === 'on') {   // We know about the 'on' key. Handle it!
        state.on = obj.on;  // Synchronise the state
        GPIO.write(relais, state.on);
      } else if (key === 'reboot') {
      	state.reboot = obj.reboot;
        Timer.set(750, 0, function() {  // incremented 'reboot' counter
          Sys.reboot(500);                 // Sync and schedule a reboot
        }, null);
      }
    }
    reportState();  // Report our new state, hopefully clearing delta
  }
});*/



let setTimer = function() {
	if(timer_id > 0) {
		//print("DELETED TIMER WITH ID: ", timer_id);
		Timer.del(timer_id);
		timer_id = 0;
	}
	print("== STARTING NEW TIMER: ", state.timer);
	timer_id = Timer.set(state.timer, Timer.REPEAT, function() {
		read_act();

		if (AWS.isConnected() || MQTT.isConnected()) {
		  //print('== Publishing to ' + topic + ':', JSON.stringify(data));
		  MQTT.pub(topic, JSON.stringify(data), 0);
		} else {
		  print('== Not connected!');
		}

		/*if(counter > 10) {
			data.humidity = sensor_array;
			print('== Sensor Array: ', JSON.stringify(data));
			if (AWS.isConnected() || MQTT.isConnected()) {
			  print('== Publishing to ' + topic + ':', JSON.stringify(data));
			  MQTT.pub(topic, JSON.stringify(data), 0);
			} else {
			  print('== Not connected!');
			}

			sensor_array = [];
			counter = 0;
		}
		counter = counter + 1;*/
		//Sys.usleep(state.timer - 100);
		//ESP32.deepSleep(time_read - 500);
	}, null);
};

Event.on(Event.CLOUD_CONNECTED, function() {
	AWS.Shadow.get();
}, null);

