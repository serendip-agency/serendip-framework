import { Server, ServerEndpointInterface, ServerError } from '../core';
import { Collection } from 'mongodb';
import * as validator from 'validator';
import { AuthService, UserRegisterRequestInterface, UserModel } from '.';
import { UserTokenModel } from './models/UserTokenModel';


/** 
 * /api/auth/(endpoint)
*/
export class AuthController {

    public authService: AuthService;

    constructor() {

        this.authService = Server.services["AuthService"];

    }

    public register: ServerEndpointInterface = {
        method: 'post',
        publicAccess:true,
        actions: [
            (req, res, next, done) => {

                var model: UserRegisterRequestInterface = req.body;

                if (!model.username || !model.password)
                    return next(new ServerError(400, 'username or password missing'));

                if (!validator.isLength(model.username, { min: 6, max: 32 }))
                    return next(new ServerError(400, 'username should be between 6 and 32 char length'));


                if (!validator.isAlphanumeric(model.username))
                    return next(new ServerError(400, 'username should be alphanumeric a-z and 0-9'));

                if (model.email)
                    if (!validator.isEmail(model.email))
                        return next(new ServerError(400, 'email not valid'));



                if (!validator.isLength(model.password, { min: 8, max: 32 }))
                    return next(new ServerError(400, 'password should be between 8 and 32 char length'));


                model.username = model.username.trim().toLowerCase();

                next(model);

            },
            async (req, res, next, done, model) => {

                this.authService.registerUser(model, req.ip(), req.useragent()).then((userModel) => {

                    res.json(userModel);

                }).catch((err) => {

                    if (err.codeName == "DuplicateKey")
                        return next(new ServerError(400, 'username already exists'));

                    if (err.message == "DuplicateEmail")
                        return next(new ServerError(400, 'email already exists'));


                    if (err.message == "DuplicateMobile")
                        return next(new ServerError(400, 'mobile already exists'));

                    return next(new ServerError(500, 'Server Error'));

                });

            }
        ]
    };


    public resetPassword: ServerEndpointInterface = {
        method: 'post',
        publicAccess:true,
        
        actions: [
            async (req, res, next, done) => {

                if (!req.body.email && !req.body.mobile)
                    return next(new ServerError(400, 'email or mobile missing'));


                if (req.body.email)
                    if (!validator.isEmail(req.body.email))
                        return next(new ServerError(400, 'email not valid'));

                var user: UserModel = null;

                if (req.body.email)
                    user = await this.authService.findUserByEmail(req.body.email);
                else
                    user = await this.authService.findUserByMobile(req.body.mobile);

                if (!user)
                    return next(new ServerError(400, 'user not found'));

                if (user.passwordResetTokenIssueAt)
                    if (Date.now() - user.passwordResetTokenIssueAt < 1000 * 60)
                        return next(new ServerError(400, 'minimum interval between reset password request is 60 seconds'));


                var resetToken = await this.authService.getNewPasswordResetToken(user._id);

                res.json(resetToken);

            }

        ]
    };



    public checkToken: ServerEndpointInterface = {
        method: 'post',
        publicAccess : true,
        actions: [

            (req, res, next, done) => {


                this.authService.checkToken(req.body.access_token).then((token) => {

                    res.json(token);

                }).catch((e) => {

                    return next(new ServerError(400, e.message));

                });


            }

        ]
    };

    public token: ServerEndpointInterface = {
        method: 'post',
        publicAccess:true,
        
        actions: [
            async (req, res, next, done) => {


                var user: UserModel = null;


                user = await this.authService.findUserByUsername(req.body.username);

                if (!user)
                    return next(new ServerError(400, 'user/password invalid'));


                var userMatchPassword = this.authService.userMatchPassword(user, req.body.password);

                if (!userMatchPassword)
                    return next(new ServerError(400, 'user/password invalid'));


                var userToken = await this.authService.getNewToken(user._id, req.useragent(), req.client());

                res.json(userToken);


            }

        ]
    };









}