var jwt        = require("jsonwebtoken")
var bodyParser = require("body-parser")
var router     = require("express").Router()
var request    = require('request')
var xml2js     = require('xml2js')

module.exports = (config) => {

	router.get("/metadata", (req, res) => {

		var url = config.fhirServer.dstu1 + "/metadata"
        var acceptsJSON = req.headers.accept.indexOf('json') >= 0

        if (acceptsJSON) {
			request({
			    url: url,
			    json: true
			}, (error, response, body) => {
			    if (!error && response.statusCode === 200) {
			    	var conformance = body
					conformance.rest[0].security = {
				        "extension": [
				          {
				            "url": "http://fhir-registry.smarthealthit.org/Profile/oauth-uris#authorize",
				            "valueUri": config.baseUrl + "/dstu1/authorize"
				          },
				          {
				            "url": "http://fhir-registry.smarthealthit.org/Profile/oauth-uris#token",
				            "valueUri": config.baseUrl + "/dstu1/token"
				          }
				        ],
				        "service": [
				          {
				            "coding": [
				              {
				                "system": "http://hl7.org/fhir/vs/restful-security-service",
				                "code": "OAuth2"
				              }
				            ],
				            "text": "OAuth version 2 (see oauth.net)."
				          }
				        ],
				        "description": "SMART on FHIR uses OAuth2 for authorization"
				      }
					res.type("application/json+fhir")
					res.send(conformance)
			    }
			})
		} else {
			request(url, (error, response, body) => {
			    if (!error && response.statusCode === 200) {
					var parseString = xml2js.parseString
					parseString(body, (err, result) => {
					    result.Conformance.rest[0].security = [
					      {
					         "$": {
					            "url": "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris"
					         },
					         "extension": [
					            {
					               "$": {
					                  "url": "authorize"
					               },
					               "valueUri": [
					                  {
					                     "$": {
					                        "value": config.baseUrl + "/dstu1/authorize"
					                     }
					                  }
					               ]
					            },
					            {
					               "$": {
					                  "url": "token"
					               },
					               "valueUri": [
					                  {
					                     "$": {
					                        "value": config.baseUrl + "/dstu1/token"
					                     }
					                  }
					               ]
					            }
					         ]
					      }
					   ]

					    var builder = new xml2js.Builder()
					    var xml = builder.buildObject(result)

					    res.type("application/xml+fhir")
					    res.send(xml)
					})
			    }
			})
		}

	})

	router.get("/authorize", (req, res) => {
		if (req.query.aud != config.baseUrl) {
			//TODO: follow oauth spec here
			return res.send("Bad audience value", 400)
		}
		var incomingJwt = req.query.launch.replace(/=/g, "")
		var code = {
			context: jwt.decode(incomingJwt),
			client_id: req.query.client_id,
			scope: req.query.scope
		}
		var state = req.query.state
		var signedCode = jwt.sign(code, config.jwtSecret, {expiresIn: "5m"})
		res.redirect(req.query.redirect_uri + `?code=${signedCode}&state=${state}`)
	})

	router.post("/token", bodyParser.urlencoded({extended: false}), (req, res) => {
        var grantType = req.body.grant_type
        var codeRaw

        if (grantType === 'authorization_code') {
            codeRaw = req.body.code
        } else if (grantType === 'refresh_token') {
            codeRaw = req.body.refresh_token
        }
        
        var code = jwt.verify(codeRaw, config.jwtSecret)

        if (code.scope.indexOf('offline_access') >= 0) {
            code.context['refresh_token'] = jwt.sign(code, config.jwtSecret)
        }

		var token = Object.assign({}, code.context, {
			token_type: "bearer",
			expires_in: 3600,
			scope: code.scope, 
			client_id: req.body.client_id
		})
		token.access_token = jwt.sign(Object.assign({}, token), config.jwtSecret, {expiresIn: "1h"})
		res.json(token)
	})

	return router

}