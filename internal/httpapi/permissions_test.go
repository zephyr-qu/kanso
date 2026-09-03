package httpapi

import (
	"testing"

	"kanso/internal/service"
)

func TestWorkspaceContextFromPath(t *testing.T) {
	tests := []struct {
		name                    string
		path                    string
		workspaceID, resourceID string
		resourceType            service.ResourceType
	}{
		{name: "workspace route", path: "/api/workspaces/w1/projects", workspaceID: "w1"},
		{name: "project resource", path: "/api/projects/p1", resourceType: "project", resourceID: "p1"},
		{name: "nested task resource", path: "/api/tasks/t1/comments", resourceType: "task", resourceID: "t1"},
		{name: "unknown api route", path: "/api/members/m1", resourceID: ""},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			workspaceID, resourceType, resourceID := workspaceContextFromPath(test.path)
			if workspaceID != test.workspaceID || resourceType != test.resourceType || resourceID != test.resourceID {
				t.Fatalf("workspaceContextFromPath(%q) = (%q, %q, %q), want (%q, %q, %q)",
					test.path, workspaceID, resourceType, resourceID,
					test.workspaceID, test.resourceType, test.resourceID)
			}
		})
	}
}
