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
let relais = 14;
let relais_grass = 25;

let test_successful = false;

//let config = {relais: [{"pin": 14}, {"pin":25}]};
let relais_array = {"lawn": 25, "flower": 14};

let topic = 'devices/' + Cfg.get('device.id') + '/data-debug';
let topic_trigger = 'devices/water/trigger';
let shadow_update_topic = '$aws/things/' + Cfg.get('device.id') + '/shadow/update';
let data = {humidity: 0, time: "", device: Cfg.get('device.id')};  // Device state
let state = {on: false, override: false, timer: 20*1000, threshold: 4000, wateron: 5*60*1000, pigeon: false};
let state_multi = {"lawn": {on: false, override: false, timer: 20*1000, threshold: 4000, wateron: 5*60*1000},
             "flower": {on: false, override: false, timer: 20*1000, threshold: 4000, wateron: 5*60*1000}};


let shadow_restored = false;

let setRelais = function() {
    for (let key in relais_array) {
        GPIO.write(relais_array[key], state_multi[key].on);
    }
  	MQTT.pub(topic_trigger, JSON.stringify(state_multi), 0);
};

GPIO.set_mode(sensor, GPIO.MODE_INPUT);

for (let key in relais_array) {
    GPIO.set_mode(relais_array[key], GPIO.MODE_OUTPUT);
}

setRelais();

ADC.enable(sensor);

let sensor_data = 0;
let timer_id = {"lawn": 0, "flower": 0};

let sensor_array = [];
let counter = 1;

let active = false;

let alex_state = false;
let pigon_active = false;

let handleTrigger = function(msg, type) {
  if(msg.mode === "duration" && !state_multi[type].on) {
    let duration = msg.duration;
    state_multi[type].on = true;
    setRelais();
    reportState();
    
    let userdata = {
      type: type,
    };
    
    if(timer_id[type] !== 0) {
      Timer.del(timer_id[type]);
    }
    
    timer_id[type] = Timer.set(1000 * duration, 0, function(userdata) {
      state_multi[userdata.type].on = false;
      setRelais();
      reportState();
      MQTT.pub(topic_trigger, JSON.stringify({"timer": "off", "type": userdata.type}), 0);
      timer_id[userdata.type] = 0;
    }, userdata);
    MQTT.pub(topic_trigger, JSON.stringify({"timer": "on", "type": type, "timer_id": timer_id[type], "duration": duration}), 0);
  } else if (msg.mode === "switch") {
    
    if(timer_id[type] !== 0) {
      Timer.del(timer_id[type]);
    }
    
    state_multi[type].on = msg.on;
    setRelais();
    reportState();
  }
};

MQTT.sub(topic_trigger, function(conn, topic, msg) {
  //print(msg);
  msg = JSON.parse(msg);
  if(msg.mode === "duration" || msg.mode === "switch") {
    if(msg.type === "lawn") {
      msg.type = "lawn";
    } else if (msg.type === "flower") {
      msg.type = "flower";
    } else {
      msg.type = "all";
    }

    if(msg.type === "all") {
      for (let key in relais_array) {
        handleTrigger(msg, key);
      }
    } else {
      handleTrigger(msg, msg.type);
    }
  }

}, null);

let reportState = function() {
  //Shadow.update(0, {desired: null, reported: state});
  //AWS.Shadow.update(0, state);
};


/*AWS.Shadow.setStateHandler(function(data, event, reported, desired, reported_metadata, desired_metadata) {
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
    state.on = false; // always start off
    reportState();
    setRelais();
    //setTimer();
    //read_act();
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
	    	//setTimer();
	    }
		
    }
    MQTT.pub(shadow_update_topic, JSON.stringify({"state": {"desired": null}}), 0);
    reportState();
    setRelais();
  }
  //print(JSON.stringify(reported), JSON.stringify(desired));
}, null);*/


Event.on(Event.CLOUD_CONNECTED, function() {
  //AWS.Shadow.get();
  
  MQTT.pub(topic_trigger, JSON.stringify({"status": "connecting", "test_successful": test_successful}), 0);

  /*if(test_successful === false) {
    MQTT.pub(topic_trigger, JSON.stringify({"status": "starting test"}), 0);
    
    state_multi["lawn"].on = true;
    setRelais();
    test_successful = true;
    
    Timer.set(1000, 0, function() {
      state_multi["lawn"].on = false;
      setRelais();
      MQTT.pub(topic_trigger, JSON.stringify({"status": "test ended"}), 0);
    }, null);
  }*/
  
  /*updateState();
  reportState();
  updateState();*/
}, null);

