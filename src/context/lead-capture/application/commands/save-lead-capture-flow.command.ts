import {
  LeadCaptureIntroPrimitives,
  LeadCaptureStepPrimitives,
} from '../../domain/entities/lead-capture-flow';

export class SaveLeadCaptureFlowCommand {
  constructor(
    public readonly input: {
      companyId: string;
      updatedBy: string;
      name: string;
      enabled: boolean;
      intro: LeadCaptureIntroPrimitives;
      startStepId: string;
      steps: LeadCaptureStepPrimitives[];
    },
  ) {}
}
