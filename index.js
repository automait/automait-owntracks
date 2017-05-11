module.exports = init

var Emitter = require('events').EventEmitter
  , mqtt = require('mqtt')
  , haversine = require('haversine')

function init(callback) {
  callback(null, 'owntracks', Owntracks)
}

function Owntracks(automait, logger, config) {
  Emitter.call(this)
  this.automait = automait
  this.logger = logger
  this.config = config
  this.locations = setInitialLocations.call(this, this.config)
}

Owntracks.prototype = Object.create(Emitter.prototype)

Owntracks.prototype.init = function () {
  var client = mqtt.connect('mqtt://' + this.config.connString)

  client.on('connect', function () {
    client.subscribe('owntracks/#')
  })

  client.on('message', function (topic, message) {
    var data = JSON.parse(message.toString())
      , isNotPing = !data.t || (data.t && data.t !== 'p')
      , isAccurateEnough = data.acc && data.acc <= 500

    if (data && data._type === 'location' && data.lat && data.lon && data.tid && data.tst && isNotPing
      && isAccurateEnough) {
      var person = data.tid
        , now = new Date()
        , messageTime = new Date(data.tst * 1000)
        , messageTimeAgo = now.getTime() - messageTime.getTime()
        , fiveMins = 300000

      if (this.config.people.indexOf(person) === -1 || messageTimeAgo > fiveMins) return

      this.config.locations.forEach(function (location) {
        var locationLatLon = { latitude: location.latitude, longitude: location.longitude }
          , personLatLong = { latitude: data.lat, longitude: data.lon }
          , distanceFromLocation = haversine(locationLatLon, personLatLong, { unit: 'km' }) * 1000
          , isAtLocation = this.locations[location.name][person]
          , eventName = 'location:' + location.name + ':person:' + person + ':'

        if (distanceFromLocation <= 25 && !isAtLocation) {
          this.locations[location.name][person] = true
          eventName += 'arriving'
          this.emit(eventName, this.locations)
        } else if (distanceFromLocation > 25 && isAtLocation) {
          this.locations[location.name][person] = false
          eventName += 'leaving'
          this.emit(eventName, this.locations)
        }

      }.bind(this))
    }
  }.bind(this))
}

function setInitialLocations(config) {
  var locations = {}
  config.locations.forEach(function (location) {
    var data = {}
    config.people.forEach(function (person) {
      data[person] = false
    })
    locations[location.name] = data
  })
  return locations
}
