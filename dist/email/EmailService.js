"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const nodeMailer = require("nodemailer");
const fs = require("fs");
const glob = require("glob");
const path = require("path");
class EmailService {
    constructor(dbService, viewEngineService) {
        this.dbService = dbService;
        this.viewEngineService = viewEngineService;
    }
    static configure(options) {
        EmailService.options = _.extend(EmailService.options, options);
    }
    loadTemplates() {
        return new Promise((resolve, reject) => {
            glob(path.join(EmailService.options.templatesPath, "*.html"), (err, templates) => {
                templates.forEach(tmp => {
                    EmailService.emailTemplates.push({
                        name: path.parse(tmp).name.toLowerCase(),
                        source: fs.readFileSync(tmp).toString()
                    });
                });
                resolve();
            });
        });
    }
    async start() {
        this.outboxCollection = await this.dbService.collection("EmailOutbox");
        if (EmailService.options.templatesPath)
            await this.loadTemplates();
    }
    send(emailModel) {
        return new Promise((resolve, reject) => {
            var transporter = nodeMailer.createTransport({
                host: EmailService.options.smtp.host,
                port: EmailService.options.smtp.port,
                secure: EmailService.options.smtp.ssl,
                auth: {
                    user: EmailService.options.smtp.username,
                    pass: EmailService.options.smtp.password
                }
            });
            if (!emailModel.attachments)
                emailModel.attachments = [];
            if (emailModel.template && emailModel.template.name) {
                if (!emailModel.template.source)
                    emailModel.template.source = _.findWhere(EmailService.emailTemplates, {
                        name: emailModel.template.name
                    });
                if (!emailModel.template.data)
                    emailModel.template.data = {};
                if (emailModel.template.source)
                    emailModel.html = this.viewEngineService.renderMustache(emailModel.template.source, emailModel.template.data);
                else
                    reject("no template source");
            }
            transporter.sendMail(emailModel, (err, info) => {
                if (err)
                    return reject(err);
                this.outboxCollection.insertOne(emailModel);
                resolve(info);
            });
        });
    }
}
EmailService.options = {};
EmailService.emailTemplates = [];
exports.EmailService = EmailService;
