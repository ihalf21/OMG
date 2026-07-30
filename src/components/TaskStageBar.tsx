import React from 'react';
import { computeTaskStageProgress, taskStagesTotal } from '../domain/stages';
import type { Task } from '../domain/types';

interface Props {
  task: Task;
  usedHours: number;
  color: string;
  separatorColor?: string;
  labelColor?: string;
  showLabels?: boolean;
}

export default function TaskStageBar({
  task,
  usedHours,
  color,
  separatorColor = 'var(--bg-primary)',
  labelColor = 'var(--bar-contrast)',
  showLabels = true,
}: Props) {
  const stages = computeTaskStageProgress(task, usedHours);
  const total = taskStagesTotal(task.stages);
  if (stages.length === 0 || total <= 0) return null;

  return (
    <div style={{ position:'absolute', inset:0, display:'flex', zIndex:0 }}>
      {stages.map((stage, index) => {
        const widthPct = stage.estimateHours / total * 100;
        return (
          <div
            key={stage.id}
            title={`${stage.name}: ${stage.estimateHours} чч · ${stage.progressPct}%`}
            style={{
              position:'relative', width:`${widthPct}%`, minWidth:1, overflow:'hidden',
              background:color, opacity:stage.state === 'completed' ? 0.88 : 0.38,
              borderRight:index < stages.length - 1 ? `2px solid ${separatorColor}` : 'none',
            }}
          >
            {stage.state === 'current' && stage.progressPct > 0 && (
              <div style={{ position:'absolute', inset:'0 auto 0 0', width:`${stage.progressPct}%`, background:color, opacity:1 }}/>
            )}
            {showLabels && widthPct >= 18 && (
              <span style={{
                position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
                padding:'0 4px', color:labelColor, fontSize:10, fontWeight:700,
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              }}>
                {stage.name}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
