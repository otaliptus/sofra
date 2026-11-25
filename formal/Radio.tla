------------------------------- MODULE Radio -------------------------------
EXTENDS RuntimeTables
VARIABLES phase, visible, consent
vars == <<phase,visible,consent>>
Init == /\ phase = "idle" /\ visible = TRUE /\ consent = FALSE
Event(edge) ==
  /\ edge[1] = phase
  /\ IF edge[2] = "play" THEN visible ELSE TRUE
  /\ phase' = edge[3]
  /\ consent' = CASE edge[2] = "play" -> TRUE
                  [] edge[2] \in {"denied","exhausted"} -> FALSE
                  [] OTHER -> consent
  /\ UNCHANGED visible
Hide == /\ visible' = FALSE /\ phase' = "idle" /\ consent' = FALSE
Show == /\ visible' = TRUE /\ UNCHANGED <<phase,consent>>
Pause == /\ phase' = "idle" /\ consent' = FALSE /\ UNCHANGED visible
Next == Hide \/ Show \/ Pause \/ (\E edge \in RadioEdges : Event(edge))
Spec == Init /\ [][Next]_vars
OptIn == /\ (phase \in {"playing","requested"}) = consent
         /\ (~visible => phase = "idle")
=============================================================================
