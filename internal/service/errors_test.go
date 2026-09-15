package service

import (
	"errors"
	"fmt"
	"testing"
)

func TestClassifyError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want ErrorKind
	}{
		{name: "not found", err: fmt.Errorf("wrapped: %w", ErrNotFound), want: ErrorNotFound},
		{name: "forbidden", err: ErrForbidden, want: ErrorForbidden},
		{name: "invalid backup", err: ErrInvalidBackup, want: ErrorInvalidInput},
		{name: "last workspace", err: ErrLastWorkspace, want: ErrorInvalidInput},
		{name: "cross project", err: ErrCrossProjectMove, want: ErrorInvalidInput},
		{name: "member limit", err: ErrMemberLimit, want: ErrorConflict},
		{name: "admin limit", err: ErrAdminLimit, want: ErrorInvalidInput},
		{name: "last admin", err: ErrLastAdmin, want: ErrorInvalidInput},
		{name: "project archived", err: ErrProjectArchived, want: ErrorConflict},
		{name: "project incomplete", err: ErrProjectHasIncompleteTasks, want: ErrorConflict},
		{name: "unknown", err: errors.New("database down"), want: ErrorInternal},
		{name: "wrapped invalid input", err: invalidInput("任务标题不能为空"), want: ErrorInvalidInput},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ClassifyError(tc.err); got != tc.want {
				t.Fatalf("错误分类应为 %q，实际 %q", tc.want, got)
			}
		})
	}
}
