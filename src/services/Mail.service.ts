import type { GraphRest, GraphSendMailPayload } from "../graph/GraphRest";

export class MailService {

    private graph!: GraphRest;

    constructor(graph: GraphRest,) {
        this.graph = graph;
    }

    async sendEmail(payload: GraphSendMailPayload) {
        const res = await this.graph.post<any>(`/me/sendMail`, payload);
        return res
    }

}

