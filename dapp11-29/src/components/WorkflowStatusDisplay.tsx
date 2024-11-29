import React from 'react';

interface WorkflowStatusDisplayProps {
  workflowStatus: any;
}

const WorkflowStatusDisplay: React.FC<WorkflowStatusDisplayProps> = ({ workflowStatus }) => {
  return (
    <div className="workflow-status">
      <h3>Workflow Status</h3>
      {workflowStatus.steps.map((step: any, index: number) => (
        <div key={index} className={`workflow-step ${step.status || ''}`}>
          <p><strong>Step {index + 1}:</strong> {step.tool || step.description}</p>
          <p>Output: {step.output || step.result}</p>
        </div>
      ))}
      <div className="workflow-summary">
        <h4>Final Result:</h4>
        <p>{workflowStatus.finalOutput}</p>
      </div>
    </div>
  );
};

export default WorkflowStatusDisplay
