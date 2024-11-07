import React from 'react';
import { TaskDecomposition } from './ChatContext';

interface TaskDecompositionDisplayProps {
  taskDecomposition: TaskDecomposition;
}

const TaskDecompositionDisplay: React.FC<TaskDecompositionDisplayProps> = ({ taskDecomposition }) => {
  return (
    <div className="task-decomposition">
      <h3>{taskDecomposition.message}</h3>
      <div className="subtask-list">
        {taskDecomposition.tasks.map((task, index) => (
          <div key={index} className="subtask-item">
            <h4>{task.description}</h4>
            <p> <b>Agent Type:</b> {task.agentType}</p >
            <p><b>Required Skills:</b> {task.requiredSkills.join(', ')}</p >
            <p><b>Assigned Agent:</b> {task.assignedAgent ? task.assignedAgent.name : 'Unassigned'}</p >
            <p><b>Expected Output:</b> {task.expectedOutput}</p >
            {/* {task.meetsExpectations !== undefined && (
              <p>Meets Expectations: {task.meetsExpectations ? 'Yes' : 'No'}</p >
            )} */}
          </div>
        ))}
      </div>
    </div>
  );
};


export default TaskDecompositionDisplay;
