# sbc-registrar

This application provides a part of the SBC (Session Border Controller) functionality of jambonz.  It handles incoming REGISTER requests from clients, including both sip softphones and WebRTC client applications.  Authentication is delegated to customer-side logic via a configured web callback.  Information about active registrations is stored in a redis database.

## registrar database

A redis database is used to hold active registrations. When a register request arrives and is authenticated, the following values are parsed from the request:
- the address of record, or "aor" (e.g, dave@drachtio.org),
- the sip uri, or "contact" that this user can receive SIP requests on (e.g. sip:daveh@3.44.3.12:5060)
- the transport protocol that should be used to contact the user (e.g. udp, tcp, wss etc)
- the sip address of the drachtio server that received the REGISTER request, and
- the expiration of the registration, in seconds.

A hash value is created from these values and stored with an expiry value equal to the number of seconds granted to the registration (note that when a sip client is detected as being behind a firewall, the application will reduce the granted expires value to 30 seconds or so, in order to force the client to re-register frequently).

The hash value is inserted with a key being the aor:
```
aor => {contact, protocol, sbcAddress}, expiry = registration expires value
```

## Configuration

Configuration is provided via the [npmjs config](https://www.npmjs.com/package/config) package.  The following elements make up the configuration for the application:
##### drachtio server location
```
{
  "drachtio": {
    "port": 3001,
    "secret": "cymru"
  },
```
the `drachtio` object specifies the port to listen on for tcp connections from drachtio servers as well as the shared secret that is used to authenticate to the server.

> Note: [outbound connections](https://drachtio.org/docs#outbound-connections) are used for all drachtio applications in jambonz, to allow for easier centralization and clustering of application logic.

##### redis server location
```
  "redis": {
    "port": 6379,
    "address": "127.0.0.1"
  },
```
the `redis` object specifies the location of the redis database.  Note that in a fully-scaled out environment with multiple SBCs there will be one centralized redis database (or cluster) that stores registrations for all SBCs.

##### application log level
```
  "logging": {
    "level": "info"
  }
```
##### authentication web callback
```
  "authCallback": {
    "uri": "http://example.com/auth",
    "auth": {
      "username": "foo",
      "password": "bar"
    }
  },
```
the `authCallback` object specifies the http(s) url that a POST request will be sent to for each incoming REGISTER request.  The body of the POST will be a json payload including the following information:
```
    {
      "method": "REGISTER",
      {
        "username": "daveh",
        "realm": "drachtio.org",
        "nonce": "2q4gct3g3ghbfj34h3",
        "uri": "sip:dhorton@drachtio.org",
        "response": "djaduys9g9d",
      }
    }
```
It is the responsibility of the customer-side logic to retrieve the associated password for the given username and authenticate the request by calculating a response token (per the algorithm described in [RFC 2617](https://tools.ietf.org/html/rfc2617#section-3.2.2)) and comparing it to that provided in the request.  

The `auth` property in the `authCallback` object is optional.  It should be provided if the customer callback is using HTTP Basic Authentication to protect the endpoint.

If the request is successfully authenticated, the callback should return a 200 OK response with a JSON body including:
```
{"status": "ok"}
```
This will signal the application to accept the registration request, respond accordingly to the client, and update the redis database with the active registration.

In the case of failure, the customer-side application *should* return a 'msg' property indicating the reason, e.g.
```
{"status": "fail", "msg": "invalid username"}
```
