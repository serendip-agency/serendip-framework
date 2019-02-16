"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../core");
const utils_1 = require("../utils");
const _1 = require(".");
const _ = require("underscore");
const http_1 = require("../http");
/**
 * /api/auth/(endpoint)
 */
class AuthController {
    constructor() {
        this.register = {
            method: "post",
            publicAccess: true,
            actions: [
                (req, res, next, done) => {
                    var model = req.body;
                    if (!model.username || !model.password)
                        return next(new http_1.HttpError(400, "username or password missing"));
                    if (!model.email)
                        if (utils_1.Validator.isEmail(model.username))
                            model.email = model.username;
                    if (!model.mobile)
                        if (model.username.startsWith("+"))
                            if (utils_1.Validator.isNumeric(model.username.replace("+", "")))
                                model.mobile = model.username;
                    if (!utils_1.Validator.isLength(model.username, 6, 32))
                        return next(new http_1.HttpError(400, "username should be between 6 and 32 char length"));
                    if (!utils_1.Validator.isAlphanumeric(model.username))
                        return next(new http_1.HttpError(400, "username should be alphanumeric a-z and 0-9"));
                    if (model.email)
                        if (!utils_1.Validator.isEmail(model.email))
                            return next(new http_1.HttpError(400, "email not valid"));
                    if (!utils_1.Validator.isLength(model.password, 4, 32))
                        return next(new http_1.HttpError(400, "password should be between 4 and 32 char length"));
                    model.username = model.username.trim().toLowerCase();
                    next(model);
                },
                (req, res, next, done, model) => {
                    this.authService
                        .registerUser(model, req.ip(), req.useragent(), false)
                        .then(userModel => {
                        res.json(_.pick(userModel, "username"));
                    })
                        .catch(err => {
                        if (err.codeName == "DuplicateKey")
                            return next(new http_1.HttpError(400, "username already exists"));
                        if (err.message == "DuplicateEmail")
                            return next(new http_1.HttpError(400, "email already exists"));
                        if (err.message == "DuplicateMobile")
                            return next(new http_1.HttpError(400, "mobile already exists"));
                        if (core_1.Server.opts.logging != "silent")
                            console.log("User register => Error", err);
                        return next(new http_1.HttpError(500, err));
                    });
                }
            ]
        };
        this.sendResetPasswordToken = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    if (!req.body.email && !req.body.mobile)
                        return next(new http_1.HttpError(400, "email or mobile missing"));
                    if (req.body.email)
                        if (!utils_1.Validator.isEmail(req.body.email))
                            return next(new http_1.HttpError(400, "email not valid"));
                    var user = null;
                    if (req.body.email)
                        user = await this.authService.findUserByEmail(req.body.email);
                    else
                        user = await this.authService.findUserByMobile(req.body.mobile);
                    if (!user)
                        return next(new http_1.HttpError(400, "user not found"));
                    if (user.passwordResetTokenIssueAt)
                        if (Date.now() - user.passwordResetTokenIssueAt < 1000 * 60)
                            return next(new http_1.HttpError(400, "minimum interval between reset password request is 60 seconds"));
                    await this.authService.sendPasswordResetToken(user._id, req.useragent().toString(), req.ip().toString());
                    done();
                }
            ]
        };
        this.addUserToGroup = {
            method: "post",
            publicAccess: false,
            actions: [
                async (req, res, next, done) => {
                    if (req.user.groups.indexOf("admin") == -1)
                        return next(new http_1.HttpError(401, "admin access required"));
                    this.authService.addUserToGroup(req.body.user, req.body.group);
                    done(202, "added to group");
                }
            ]
        };
        this.deleteUserFromGroup = {
            method: "post",
            publicAccess: false,
            actions: [
                async (req, res, next, done) => {
                    if (req.user.groups.indexOf("admin") == -1)
                        return next(new http_1.HttpError(401, "admin access required"));
                    this.authService.deleteUserFromGroup(req.body.user, req.body.group);
                    done(202, "removed from group");
                }
            ]
        };
        this.changeSecret = {
            method: "post",
            publicAccess: false,
            actions: [
                async (req, res, next, done) => {
                    var userId = req.user._id.toString();
                    if (!req.body.secret)
                        return next(new http_1.HttpError(400, "secret is missing"));
                    if (!req.body.clientId)
                        return next(new http_1.HttpError(400, "clientId is missing"));
                    var client = await this.authService.findClientById(req.body.clientId);
                    if (!client)
                        return next(new http_1.HttpError(400, "client not found"));
                    if (client.owner != userId)
                        return next(new http_1.HttpError(400, "you need to be owner of client to change it's secret"));
                    await this.authService.setClientSecret(userId, req.body.secret);
                    done(202, "secret changed");
                }
            ]
        };
        this.changePassword = {
            method: "post",
            publicAccess: false,
            actions: [
                async (req, res, next, done) => {
                    var userId = req.user._id;
                    if (req.body.user)
                        if (req.user.groups.indexOf("admin") != -1)
                            userId = req.body.user;
                        else
                            return next(new http_1.HttpError(401, "admin access required"));
                    if (!req.body.password)
                        return next(new http_1.HttpError(400, "password is missing"));
                    if (req.body.password != req.body.passwordConfirm)
                        return next(new http_1.HttpError(400, "password and passwordConfirm do not match"));
                    await this.authService.setNewPassword(userId, req.body.password, req.ip(), req.useragent());
                    done(202, "password changed");
                }
            ]
        };
        this.resetPassword = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    if (!req.body.code)
                        return next(new http_1.HttpError(400, "code is missing"));
                    if (!req.body.password)
                        return next(new http_1.HttpError(400, "password is missing"));
                    if (req.body.password != req.body.passwordConfirm)
                        return next(new http_1.HttpError(400, "password and passwordConfirm do not match"));
                    if (!req.body.email && !req.body.mobile)
                        return next(new http_1.HttpError(400, "email or mobile missing"));
                    if (req.body.email)
                        if (!utils_1.Validator.isEmail(req.body.email))
                            return next(new http_1.HttpError(400, "email not valid"));
                    var user = null;
                    if (req.body.email)
                        user = await this.authService.findUserByEmail(req.body.email);
                    else
                        user = await this.authService.findUserByMobile(req.body.mobile);
                    if (!user)
                        return next(new http_1.HttpError(400, "user not found"));
                    await this.authService.setNewPassword(user._id, req.body.password, req.ip(), req.useragent());
                    done(202, "password changed");
                }
            ]
        };
        this.sendVerifyEmail = {
            publicAccess: true,
            method: "post",
            actions: [
                async (req, res, next, done) => {
                    if (!req.body.email)
                        return next(new http_1.HttpError(400, "email required"));
                    var user = await this.authService.findUserByEmail(req.body.email);
                    if (!user)
                        return next(new http_1.HttpError(400, "no user found with this email"));
                    this.authService
                        .sendVerifyEmail(user)
                        .then(info => {
                        res.json(info);
                    })
                        .catch(e => {
                        res.json(e);
                    });
                }
            ]
        };
        this.sendVerifySms = {
            method: "post",
            publicAccess: true,
            actions: [
                (req, res, next, done) => {
                    if (!req.body.mobile)
                        return next(new http_1.HttpError(400, "mobile required"));
                    this.authService
                        .findUserByMobile(req.body.mobile)
                        .then(user => {
                        if (!user)
                            return next(new http_1.HttpError(400, "no user found with this mobile"));
                        this.authService
                            .sendVerifySms(user, req.useragent().toString(), req.ip().toString())
                            .then(() => {
                            done(200);
                        })
                            .catch(err => next(err));
                        // .then((info) => {
                        //     res.json(info);
                        // }).catch((e) => {
                        //     next(new HttpError(500, e.message));
                        // });
                    })
                        .catch(e => next(new http_1.HttpError(500, e.message)));
                }
            ]
        };
        this.verifyMobile = {
            method: "post",
            publicAccess: true,
            actions: [
                (req, res, next, done) => {
                    if (!req.body.mobile)
                        return next(new http_1.HttpError(400, "mobile required"));
                    if (!req.body.code)
                        return next(new http_1.HttpError(400, "code required"));
                    this.authService
                        .findUserByMobile(req.body.mobile)
                        .then(user => {
                        if (!user)
                            return next(new http_1.HttpError(400, "no user found with this mobile"));
                        if (user.mobileVerificationCode != req.body.code)
                            return next(new http_1.HttpError(400, "invalid code"));
                        this.authService
                            .VerifyUserMobile(req.body.mobile, req.body.code)
                            .then(() => {
                            done(202, "mobile verified");
                        })
                            .catch(e => next(e));
                    })
                        .catch(e => next(e));
                }
            ]
        };
        this.verifyEmail = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    if (!req.body.email)
                        return next(new http_1.HttpError(400, "email required"));
                    if (!req.body.code)
                        return next(new http_1.HttpError(400, "code required"));
                    var user = await this.authService.findUserByEmail(req.body.email);
                    if (!user)
                        return next(new http_1.HttpError(400, "no user found with this email"));
                    await this.authService.VerifyUserEmail(req.body.email, req.body.code);
                    done(202, "email verified");
                }
            ]
        };
        this.clientToken = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    var client = await this.authService.findClientById(req.body.clientId);
                    if (!client)
                        return next(new http_1.HttpError(400, "client not found"));
                    if (!this.authService.clientMatchSecret(client, req.body.clientSecret))
                        return next(new http_1.HttpError(400, "client secret mismatch"));
                    this.authService
                        .insertToken({
                        userId: req.user._id.toString(),
                        useragent: req.useragent().toString(),
                        clientId: client._id.toString(),
                        grant_type: "client_credentials"
                    })
                        .then(token => {
                        res.json(token);
                    })
                        .catch(e => {
                        return next(new http_1.HttpError(500, e.message));
                    });
                }
            ]
        };
        this.refreshToken = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    var token = undefined;
                    try {
                        token = await this.authService.findTokenByAccessToken(req.body.access_token);
                    }
                    catch (err) {
                        return next(new http_1.HttpError(err.code || 500, err.message));
                    }
                    if (token)
                        if (token.refresh_token == req.body.refresh_token)
                            this.authService
                                .insertToken({
                                userId: token.userId,
                                useragent: req.useragent().toString(),
                                grant_type: "password"
                            })
                                .then(token => {
                                return res.json(token);
                            })
                                .catch(e => {
                                return next(new http_1.HttpError(400, e.message));
                            });
                        else
                            return next(new http_1.HttpError(400, "refresh token invalid"));
                    else
                        return next(new http_1.HttpError(400, "access token invalid"));
                }
            ]
        };
        this.sessions = {
            method: "get",
            publicAccess: false,
            actions: [
                async (req, res, next, done) => {
                    var model = await this.authService.findTokensByUserId(req.user._id.toString());
                    res.json(model);
                }
            ]
        };
        this.checkToken = {
            method: "post",
            publicAccess: false,
            actions: [
                (req, res, next, done) => {
                    res.json(req.userToken);
                }
            ]
        };
        this.oneTimePassword = {
            method: "post",
            publicAccess: true,
            actions: [
                async (req, res, next, done) => {
                    var mobile = req.body.mobile;
                    var mobileCountryCode = req.body.mobileCountryCode;
                    if (mobile)
                        mobile = parseInt(mobile.replace("/D/g", ""), 10);
                    if (!mobile)
                        return done(400, "mobile required");
                    var user = await this.authService.findUserByMobile(mobile, mobileCountryCode);
                    console.log(mobile, user);
                    if (!user) {
                        user = await this.authService.usersCollection.insertOne({
                            registeredAt: Date.now(),
                            mobile: parseInt(mobile).toString(),
                            mobileCountryCode: mobileCountryCode || "+98",
                            mobileVerified: false,
                            username: mobileCountryCode || "+98" + parseInt(mobile).toString(),
                            registeredByIp: req.ip().toString(),
                            registeredByUseragent: req.useragent().toString(),
                            groups: []
                        });
                    }
                    this.authService
                        .sendOneTimePassword(user._id, req.useragent().toString(), req.ip().toString())
                        .then(() => done(200, "one-time password sent"))
                        .catch(e => {
                        done(500, e.message | e);
                    });
                }
            ]
        };
        this.token = {
            method: "post",
            publicAccess: true,
            actions: [
                (req, res, next) => {
                    if (!req.body.grant_type)
                        req.body.grant_type = "password";
                    next();
                },
                async (req, res, next, done) => {
                    if (req.body.grant_type != "password")
                        return next();
                    var user = null;
                    user = await this.authService.findUserByUsername(req.body.username);
                    if (!user)
                        user = await this.authService.findUserByEmail(req.body.username);
                    if (!user && req.body.mobile)
                        user = await this.authService.findUserByMobile(parseInt(req.body.mobile).toString(), req.body.mobileCountryCode);
                    if (!user)
                        user = await this.authService.findUserByMobile(parseInt(req.body.username).toString(), req.body.mobileCountryCode);
                    if (!user)
                        return next(new http_1.HttpError(400, "user/password invalid"));
                    var userMatchPassword = false;
                    if (req.body.password)
                        userMatchPassword = this.authService.userMatchPassword(user, req.body.password);
                    var userMatchOneTimePassword = false;
                    if (req.body.oneTimePassword)
                        userMatchOneTimePassword = this.authService.userMatchOneTimePassword(user, req.body.oneTimePassword);
                    if (user.twoFactorEnabled) {
                        if (!req.body.password)
                            return next(new http_1.HttpError(400, "include password"));
                        if (!userMatchPassword || !userMatchOneTimePassword)
                            return next(new http_1.HttpError(400, "user/password invalid"));
                    }
                    else {
                        if (!userMatchPassword && !userMatchOneTimePassword)
                            return next(new http_1.HttpError(400, "user/password invalid"));
                    }
                    if (userMatchOneTimePassword) {
                        user.mobileVerified = true;
                        await this.authService.usersCollection.updateOne(user, user._id);
                    }
                    else {
                        if (_1.AuthService.options.mobileConfirmationRequired)
                            if (!user.mobileVerified)
                                return next(new http_1.HttpError(403, "mobile not confirmed"));
                        if (_1.AuthService.options.emailConfirmationRequired)
                            if (!user.emailVerified)
                                return next(new http_1.HttpError(403, "email not confirmed"));
                    }
                    var userToken = await this.authService.insertToken({
                        userId: user._id.toString(),
                        useragent: req.useragent(),
                        grant_type: !userMatchOneTimePassword ? "password" : "one-time"
                    });
                    userToken.username = user.username;
                    console.log(userToken);
                    res.json(userToken);
                }
            ]
        };
        this.authService = core_1.Server.services["AuthService"];
    }
}
exports.AuthController = AuthController;
